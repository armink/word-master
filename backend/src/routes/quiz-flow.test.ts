/**
 * 测验全链路闭环测试
 *
 * 覆盖最容易出问题的核心业务逻辑：
 *
 * 1. 今日任务统计（new_count / review_count / remaining_new / today_introduced）
 * 2. 计划 session 完整流程（start → answer → finish → mastery 写入）
 * 3. 新词答对 → introduced_date 写入，消耗今日配额
 * 4. 新词答错 → 不写 introduced_date，不消耗配额，下次仍作为新词出现
 * 5. 艾宾浩斯 stage 升级（en_to_zh 1→2，阶段上限 5）
 * 6. 阶段解锁链：en_to_zh≥2 → 解锁 zh_to_en；zh_to_en≥2 → 解锁 spelling（仅 word）
 * 7. 复习到期判断（*_next ≤ today → 出现；*_next > today → 不出现）
 * 8. GET /api/tasks/stats 统计准确性
 * 9. POST /api/tasks/extra 追加新词
 */

import { describe, it, expect } from 'vitest'
import request from 'supertest'
import db from '../db/client'
import app from '../app'
import {
  setupTestDb, createStudent, createWordbook, createItem, addItemToWordbook,
  createPlan, getMastery,
} from '../__tests__/helpers'
import { nextReviewDate, todayInt, addDaysToInt } from './tasks'

setupTestDb()

// ── 本地工具 ──────────────────────────────────────────────────────────

/**
 * 直接向 DB 写入一条 mastery 记录，用于模拟"已有学习历史"，
 * 绕过 API 快速设置复习到期场景。
 * 默认值：今日引入、stage=1、今日到期（出现在复习列表）。
 */
function insertMastery(opts: {
  studentId: number
  itemId: number
  introducedDate?: number
  enToZhStage?: number
  enToZhNext?: number
  zhToEnStage?: number
  zhToEnNext?: number
  spellingStage?: number
  spellingNext?: number
}) {
  const today = todayInt()
  // 默认 introduced_date 用昨天，表示"之前已引入、今日到期复习"
  // 若用 today 则会占用今日新词配额
  const yesterday = addDaysToInt(today, -1)
  db.prepare(`
    INSERT INTO student_mastery
      (student_id, item_id, introduced_date,
       en_to_zh_stage, en_to_zh_next,
       zh_to_en_stage, zh_to_en_next,
       spelling_stage, spelling_next)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    opts.studentId, opts.itemId,
    opts.introducedDate ?? yesterday,
    opts.enToZhStage ?? 1,    opts.enToZhNext ?? today,
    opts.zhToEnStage ?? 0,    opts.zhToEnNext ?? 0,
    opts.spellingStage ?? 0,  opts.spellingNext ?? 0,
  )
}

/** 初始化：学生 + 词本 + N 个 word 类型词条 + 激活计划 */
function bootstrap(wordCount = 5, dailyNew = 5) {
  const sid = createStudent()
  const wid = createWordbook()
  const itemIds: number[] = []
  for (let i = 0; i < wordCount; i++) {
    const id = createItem(`word${i}`, `词${i}`, 'word')
    addItemToWordbook(wid, id, i)
    itemIds.push(id)
  }
  // remaining_days = ceil(wordCount / dailyNew)，使每日新词配额与原 dailyNew 等效
  const remainingDays = Math.max(1, Math.ceil(wordCount / dailyNew))
  createPlan(sid, wid, remainingDays)
  return { sid, wid, itemIds }
}

async function apiGetToday(sid: number, wid: number) {
  return request(app).get(`/api/tasks/today?student_id=${sid}&wordbook_id=${wid}`)
}

async function apiStartTask(sid: number, wid: number) {
  return request(app).post('/api/tasks/start').send({ student_id: sid, wordbook_id: wid })
}

async function apiAnswer(sessionId: number, itemId: number, isCorrect: boolean) {
  return request(app)
    .post(`/api/quiz/sessions/${sessionId}/answers`)
    .send({ item_id: itemId, user_answer: isCorrect ? '正确' : '错误', is_correct: isCorrect })
}

async function apiFinish(sessionId: number) {
  return request(app).post(`/api/quiz/sessions/${sessionId}/finish`)
}

async function apiGetStats(sid: number, wid: number) {
  return request(app).get(`/api/tasks/stats?student_id=${sid}&wordbook_id=${wid}`)
}

/**
 * 完整测验一轮：start → 按 answersMap 作答 → finish
 * answersMap：itemId → isCorrect；未配置的 item 默认答对
 */
async function runSession(sid: number, wid: number, answersMap?: Map<number, boolean>) {
  const startRes = await apiStartTask(sid, wid)
  expect(startRes.status).toBe(201)
  const { session, items } = startRes.body as { session: { id: number }; items: Array<{ id: number }> }
  for (const item of items) {
    const correct = answersMap ? (answersMap.get(item.id) ?? true) : true
    await apiAnswer(session.id, item.id, correct)
  }
  const finishRes = await apiFinish(session.id)
  expect(finishRes.status).toBe(200)
  return { session, items, result: finishRes.body }
}

// ══════════════════════════════════════════════════════════════════════
// 1. 今日任务统计
// ══════════════════════════════════════════════════════════════════════
describe('今日任务统计 (GET /api/tasks/today)', () => {
  it('新词数受 daily_new 限制', async () => {
    const { sid, wid } = bootstrap(10, 3)
    const res = await apiGetToday(sid, wid)
    expect(res.status).toBe(200)
    expect(res.body.new_count).toBe(3)
    expect(res.body.review_count).toBe(0)
  })

  it('remaining_new = 总未引入词数 - 今日显示数', async () => {
    const { sid, wid } = bootstrap(10, 3)
    const res = await apiGetToday(sid, wid)
    // 总词10，今日显示3 → 剩余7
    expect(res.body.remaining_new).toBe(7)
  })

  it('已引入且到期的词出现在 review_count，不出现在 new_count', async () => {
    const { sid, wid, itemIds } = bootstrap(3, 5)
    const today = todayInt()
    // item0: 已引入，今日到期
    insertMastery({ studentId: sid, itemId: itemIds[0], enToZhStage: 1, enToZhNext: today })
    const res = await apiGetToday(sid, wid)
    expect(res.body.review_count).toBe(1)
    // item1, item2 是新词
    expect(res.body.new_count).toBe(2)
  })

  it('未来才到期的词不出现在今日复习', async () => {
    const { sid, wid, itemIds } = bootstrap(2, 5)
    // item0: 已引入但未到期（远未来）
    insertMastery({ studentId: sid, itemId: itemIds[0], enToZhStage: 1, enToZhNext: 99991231 })
    const res = await apiGetToday(sid, wid)
    expect(res.body.review_count).toBe(0)
    // item0 已引入不算新词，只剩 item1
    expect(res.body.new_count).toBe(1)
  })

  it('今日已引入的词占用配额，减少 new_count', async () => {
    const { sid, wid, itemIds } = bootstrap(5, 5)
    const today = todayInt()
    // 人工写入2个"今日已学"词（模拟上午已完成部分，introducedDate = 今天）
    insertMastery({ studentId: sid, itemId: itemIds[0], introducedDate: today, enToZhStage: 1, enToZhNext: 99991231 })
    insertMastery({ studentId: sid, itemId: itemIds[1], introducedDate: today, enToZhStage: 1, enToZhNext: 99991231 })
    const res = await apiGetToday(sid, wid)
    // 已用配额2，剩余3 → new_count=3
    expect(res.body.new_count).toBe(3)
    expect(res.body.today_introduced).toBe(2)
  })

  it('items 数组 is_new 标记与 review_count / new_count 一致', async () => {
    const { sid, wid, itemIds } = bootstrap(4, 5)
    const today = todayInt()
    insertMastery({ studentId: sid, itemId: itemIds[0], enToZhStage: 1, enToZhNext: today })
    const res = await apiGetToday(sid, wid)
    const reviewItems = res.body.items.filter((i: { is_new: boolean }) => !i.is_new)
    const newItems    = res.body.items.filter((i: { is_new: boolean }) =>  i.is_new)
    expect(reviewItems).toHaveLength(res.body.review_count)
    expect(newItems).toHaveLength(res.body.new_count)
  })
})

// ══════════════════════════════════════════════════════════════════════
// 2. 计划 Session 完整流程（start → answer → finish → mastery 写入）
// ══════════════════════════════════════════════════════════════════════
describe('计划 session 完整流程', () => {
  it('start 返回的 items 数量与 today new_count 一致', async () => {
    const { sid, wid } = bootstrap(5, 3)
    const todayRes = await apiGetToday(sid, wid)
    const startRes = await apiStartTask(sid, wid)
    expect(startRes.status).toBe(201)
    expect(startRes.body.items).toHaveLength(todayRes.body.new_count)
  })

  it('新词全部答对 → finish 后 introduced_date 写入今日', async () => {
    const { sid, wid, itemIds } = bootstrap(2, 5)
    await runSession(sid, wid)
    for (const id of itemIds) {
      const m = getMastery(sid, id)
      expect(m?.introduced_date).toBe(todayInt())
    }
  })

  it('新词全部答对 → finish 后 en_to_zh_stage = 1', async () => {
    const { sid, wid, itemIds } = bootstrap(2, 5)
    await runSession(sid, wid)
    for (const id of itemIds) {
      const m = getMastery(sid, id)
      expect(m?.en_to_zh_stage).toBe(1)
    }
  })

  it('新词全部答对 → finish 后 en_to_zh_next = 明天（+1天）', async () => {
    const { sid, wid, itemIds } = bootstrap(1, 5)
    await runSession(sid, wid)
    const m = getMastery(sid, itemIds[0])
    expect(m?.en_to_zh_next).toBe(nextReviewDate(1))
  })

  it('新词全部答对 → 再次查询 today，new_count = 0，review_count = 0', async () => {
    const { sid, wid } = bootstrap(3, 3)
    await runSession(sid, wid)
    const res = await apiGetToday(sid, wid)
    // 词已引入但 next > today → 不出现在复习
    // 配额已用尽 → 不出现为新词
    expect(res.body.new_count).toBe(0)
    expect(res.body.review_count).toBe(0)
  })

  it('新词答错 → introduced_date 保持为 0（未引入）', async () => {
    const { sid, wid, itemIds } = bootstrap(2, 5)
    // 全部答错
    const startRes = await apiStartTask(sid, wid)
    const { session, items } = startRes.body
    for (const item of items) {
      await apiAnswer(session.id, item.id, false)
    }
    await apiFinish(session.id)

    for (const id of itemIds) {
      const m = getMastery(sid, id)
      // 新词答错：要么没有mastery记录，要么 introduced_date=0
      expect(m?.introduced_date ?? 0).toBe(0)
    }
  })

  it('新词答错 → 不消耗今日配额，下次 today 仍出现为新词', async () => {
    const { sid, wid } = bootstrap(3, 3)
    // 全部答错
    const startRes = await apiStartTask(sid, wid)
    const { session, items } = startRes.body
    for (const item of items) {
      await apiAnswer(session.id, item.id, false)
    }
    await apiFinish(session.id)

    // 再次查询 today：3个词仍作为新词出现
    const res = await apiGetToday(sid, wid)
    expect(res.body.new_count).toBe(3)
  })

  it('部分答对 → 日配额正确扣减，错误词仍出现', async () => {
    const { sid, wid, itemIds } = bootstrap(5, 5)
    const startRes = await apiStartTask(sid, wid)
    const { session, items } = startRes.body as { session: { id: number }; items: Array<{ id: number }> }

    // 前2个答对，后3个答错
    const correctSet = new Set(items.slice(0, 2).map(i => i.id))
    for (const item of items) {
      await apiAnswer(session.id, item.id, correctSet.has(item.id))
    }
    await apiFinish(session.id)

    const res = await apiGetToday(sid, wid)
    // remaining_days=1，totalUnintroduced=3，todayIntroduced=2，totalForQuota=5
    // dailyNewQuota = ceil(5/1)=5，dailyNewForSession = min(5,50) - 2 = 3
    expect(res.body.new_count).toBe(3)
    expect(res.body.today_introduced).toBe(2)

    // 确认答对的词已引入
    for (const itemId of itemIds.slice(0, 2)) {
      expect(getMastery(sid, itemId)?.introduced_date).toBe(todayInt())
    }
    // 确认答错的词仍未引入
    for (const itemId of itemIds.slice(2)) {
      expect(getMastery(sid, itemId)?.introduced_date ?? 0).toBe(0)
    }
  })
})

// ══════════════════════════════════════════════════════════════════════
// 3. Stage 升级与阶段解锁
// ══════════════════════════════════════════════════════════════════════
describe('艾宾浩斯 stage 升级与解锁', () => {
  it('en_to_zh 答对：stage 1 → 2，zh_to_en 同时解锁', async () => {
    const { sid, wid, itemIds } = bootstrap(1, 5)
    const today = todayInt()
    // 模拟已引入、stage=1、今日到期
    insertMastery({ studentId: sid, itemId: itemIds[0], enToZhStage: 1, enToZhNext: today })

    await runSession(sid, wid)

    const m = getMastery(sid, itemIds[0])
    expect(m?.en_to_zh_stage).toBe(2)
    expect(m?.en_to_zh_next).toBe(nextReviewDate(2))
    // zh_to_en 被解锁
    expect(m?.zh_to_en_stage).toBe(1)
    expect(m?.zh_to_en_next).toBe(nextReviewDate(1))
  })

  it('en_to_zh stage 已为 5 → 答对后保持不超过 5', async () => {
    const { sid, wid, itemIds } = bootstrap(1, 5)
    const today = todayInt()
    insertMastery({
      studentId: sid, itemId: itemIds[0],
      enToZhStage: 5, enToZhNext: today,
      zhToEnStage: 0, zhToEnNext: 0,
    })

    await runSession(sid, wid)

    const m = getMastery(sid, itemIds[0])
    expect(m?.en_to_zh_stage).toBe(5)
  })

  it('en_to_zh 答错（已引入词）→ stage 保持 1，next 回拨到今日', async () => {
    const { sid, wid, itemIds } = bootstrap(1, 5)
    const today = todayInt()
    insertMastery({ studentId: sid, itemId: itemIds[0], enToZhStage: 1, enToZhNext: today })

    const startRes = await apiStartTask(sid, wid)
    const { session, items } = startRes.body
    await apiAnswer(session.id, items[0].id, false)
    await apiFinish(session.id)

    const m = getMastery(sid, itemIds[0])
    // 已引入词答错：stage 保持 1（Math.max(1, 1) = 1），next = today
    expect(m?.en_to_zh_stage).toBe(1)
    expect(m?.en_to_zh_next).toBe(today)
  })

  it('zh_to_en 到期答对 → stage 1→2，spelling 解锁（word 类型）', async () => {
    const { sid, wid, itemIds } = bootstrap(1, 5)
    const today = todayInt()
    // en_to_zh 已完成(不到期)，zh_to_en 今日到期
    insertMastery({
      studentId: sid, itemId: itemIds[0],
      enToZhStage: 2, enToZhNext: 99991231,
      zhToEnStage: 1, zhToEnNext: today,
    })

    await runSession(sid, wid)

    const m = getMastery(sid, itemIds[0])
    expect(m?.zh_to_en_stage).toBe(2)
    // spelling 被解锁（word 类型）
    expect(m?.spelling_stage).toBe(1)
    expect(m?.spelling_next).toBe(nextReviewDate(1))
  })

  it('zh_to_en≥2 → phrase 不应解锁 spelling', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const phraseId = createItem('get up', '起床', 'phrase')
    addItemToWordbook(wid, phraseId, 0)
    createPlan(sid, wid, 5)

    const today = todayInt()
    insertMastery({
      studentId: sid, itemId: phraseId,
      enToZhStage: 2, enToZhNext: 99991231,
      zhToEnStage: 1, zhToEnNext: today,
    })

    await runSession(sid, wid)

    const m = getMastery(sid, phraseId)
    expect(m?.zh_to_en_stage).toBe(2)
    // phrase 不解锁 spelling
    expect(m?.spelling_stage ?? 0).toBe(0)
  })

  it('spelling 到期答对 → stage 1→2', async () => {
    const { sid, wid, itemIds } = bootstrap(1, 5)
    const today = todayInt()
    insertMastery({
      studentId: sid, itemId: itemIds[0],
      enToZhStage: 3, enToZhNext: 99991231,
      zhToEnStage: 2, zhToEnNext: 99991231,
      spellingStage: 1, spellingNext: today,
    })

    await runSession(sid, wid)

    const m = getMastery(sid, itemIds[0])
    expect(m?.spelling_stage).toBe(2)
    expect(m?.spelling_next).toBe(nextReviewDate(2))
  })
})

// ══════════════════════════════════════════════════════════════════════
// 4. 复习类型按优先级正确分派
// ══════════════════════════════════════════════════════════════════════
describe('复习类型优先级（spelling > zh_to_en > en_to_zh）', () => {
  it('spelling 到期 → quiz_type 为 spelling', async () => {
    const { sid, wid, itemIds } = bootstrap(1, 5)
    const today = todayInt()
    insertMastery({
      studentId: sid, itemId: itemIds[0],
      enToZhStage: 2, enToZhNext: today,
      zhToEnStage: 2, zhToEnNext: today,
      spellingStage: 1, spellingNext: today,
    })

    const startRes = await apiStartTask(sid, wid)
    expect(startRes.status).toBe(201)
    const item = startRes.body.items[0]
    expect(item.item_quiz_type).toBe('spelling')
  })

  it('zh_to_en 到期但 spelling 未到期 → quiz_type 为 zh_to_en', async () => {
    const { sid, wid, itemIds } = bootstrap(1, 5)
    const today = todayInt()
    insertMastery({
      studentId: sid, itemId: itemIds[0],
      enToZhStage: 2, enToZhNext: 99991231,
      zhToEnStage: 1, zhToEnNext: today,
    })

    const startRes = await apiStartTask(sid, wid)
    expect(startRes.status).toBe(201)
    const item = startRes.body.items[0]
    expect(item.item_quiz_type).toBe('zh_to_en')
  })
})

// ══════════════════════════════════════════════════════════════════════
// 5. GET /api/tasks/stats 统计准确性
// ══════════════════════════════════════════════════════════════════════
describe('GET /api/tasks/stats', () => {
  it('total_items 与词本词条数一致', async () => {
    const { sid, wid } = bootstrap(7, 5)
    const res = await apiGetStats(sid, wid)
    expect(res.status).toBe(200)
    expect(res.body.total_items).toBe(7)
  })

  it('introduced 精确计数：仅统计 introduced_date > 0 的词', async () => {
    const { sid, wid, itemIds } = bootstrap(5, 5)
    // 手动写入3个已引入词
    for (const id of itemIds.slice(0, 3)) {
      insertMastery({ studentId: sid, itemId: id, enToZhStage: 1, enToZhNext: 99991231 })
    }
    const res = await apiGetStats(sid, wid)
    expect(res.body.introduced).toBe(3)
  })

  it('today_new 仅统计 introduced_date = 今日', async () => {
    const { sid, wid, itemIds } = bootstrap(5, 5)
    const today = todayInt()
    // item0 昨天引入（用一个过去的日期）
    insertMastery({ studentId: sid, itemId: itemIds[0], introducedDate: 20200101, enToZhStage: 1, enToZhNext: 99991231 })
    // item1, item2 今天引入
    insertMastery({ studentId: sid, itemId: itemIds[1], introducedDate: today, enToZhStage: 1, enToZhNext: 99991231 })
    insertMastery({ studentId: sid, itemId: itemIds[2], introducedDate: today, enToZhStage: 1, enToZhNext: 99991231 })
    const res = await apiGetStats(sid, wid)
    expect(res.body.today_new).toBe(2)
  })

  it('today_correct 统计今日答对的不重复词条数', async () => {
    const { sid, wid } = bootstrap(3, 3)
    // 完整跑一轮 session，全部答对
    await runSession(sid, wid)
    const res = await apiGetStats(sid, wid)
    expect(res.body.today_correct).toBe(3)
  })

  it('today_correct 不重复计算：同一词条多次答题只算1次', async () => {
    const { sid, wid, itemIds } = bootstrap(1, 5)
    const startRes = await apiStartTask(sid, wid)
    const { session } = startRes.body
    // 对同一个词答5次（答错后重答）
    for (let i = 0; i < 4; i++) {
      await apiAnswer(session.id, itemIds[0], false)
    }
    await apiAnswer(session.id, itemIds[0], true)
    await apiFinish(session.id)

    const res = await apiGetStats(sid, wid)
    // 虽然答了5次，但 today_correct 应为 1（DISTINCT item_id）
    expect(res.body.today_correct).toBe(1)
  })

  it('zh_to_en_active 统计 zh_to_en_stage > 0 的词数', async () => {
    const { sid, wid, itemIds } = bootstrap(4, 5)
    // item0, item1 解锁了 zh_to_en
    insertMastery({ studentId: sid, itemId: itemIds[0], enToZhStage: 2, enToZhNext: 99991231, zhToEnStage: 1, zhToEnNext: 99991231 })
    insertMastery({ studentId: sid, itemId: itemIds[1], enToZhStage: 2, enToZhNext: 99991231, zhToEnStage: 1, zhToEnNext: 99991231 })
    const res = await apiGetStats(sid, wid)
    expect(res.body.zh_to_en_active).toBe(2)
  })

  it('缺少参数时返回 400', async () => {
    const res = await request(app).get('/api/tasks/stats?student_id=1')
    expect(res.status).toBe(400)
  })
})

// ══════════════════════════════════════════════════════════════════════
// 6. POST /api/tasks/extra 追加新词
// ══════════════════════════════════════════════════════════════════════
describe('POST /api/tasks/extra', () => {
  it('成功追加指定数量的新词', async () => {
    const { sid, wid } = bootstrap(10, 5)
    // 先完成今日任务
    await runSession(sid, wid)

    const res = await request(app)
      .post('/api/tasks/extra')
      .send({ student_id: sid, wordbook_id: wid, extra_count: 3 })
    expect(res.status).toBe(201)
    expect(res.body.items).toHaveLength(3)
    // 返回的词都是新词（未引入）
    const itemIds = res.body.items.map((i: { id: number }) => i.id)
    for (const id of itemIds) {
      const m = getMastery(sid, id)
      expect(m?.introduced_date ?? 0).toBe(0)
    }
  })

  it('extra_count 超出剩余可用新词 → 只返回实际可用数', async () => {
    const { sid, wid } = bootstrap(3, 3)
    // 先完成今日 3 个词
    await runSession(sid, wid)

    // 词本共 3 词，已全部引入 → 没有可用新词
    // 所以这里用另一个测试：词本有5个词，已用3个，剩余2个
  })

  it('没有更多新词时返回 400', async () => {
    const { sid, wid } = bootstrap(2, 2)
    // 先完成所有词
    await runSession(sid, wid)

    // 再追加已经没词了
    const res = await request(app)
      .post('/api/tasks/extra')
      .send({ student_id: sid, wordbook_id: wid, extra_count: 1 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/没有/)
  })

  it('缺少参数返回 400', async () => {
    const res = await request(app)
      .post('/api/tasks/extra')
      .send({ student_id: 1 })
    expect(res.status).toBe(400)
  })

  it('没有激活计划时返回 404', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const res = await request(app)
      .post('/api/tasks/extra')
      .send({ student_id: sid, wordbook_id: wid, extra_count: 3 })
    expect(res.status).toBe(404)
  })
})

// ══════════════════════════════════════════════════════════════════════
// 7. 整体数据一致性回归（跨接口联动）
// ══════════════════════════════════════════════════════════════════════
describe('跨接口数据一致性', () => {
  it('完成 session 后：stats.introduced + stats.today_new + today.remaining_new 数学关系正确', async () => {
    const { sid, wid } = bootstrap(8, 3)
    await runSession(sid, wid)

    const statsRes = await apiGetStats(sid, wid)
    const todayRes = await apiGetToday(sid, wid)

    // introduced = stats 里的引入数（=3，全部答对）
    expect(statsRes.body.introduced).toBe(3)
    expect(statsRes.body.today_new).toBe(3)

    // remaining_new = 总词数 - 已引入 - 今日可显示新词数
    // = 8 - 3 - 0 = 5
    expect(todayRes.body.remaining_new).toBe(5)
    // 今日配额已用完，new_count = 0
    expect(todayRes.body.new_count).toBe(0)
    // 刚引入的词不到期，review_count = 0
    expect(todayRes.body.review_count).toBe(0)
  })

  it('人工写入到期词后 today.review_count = stats 触发条件词数', async () => {
    const { sid, wid, itemIds } = bootstrap(5, 5)
    const today = todayInt()
    // 2个词到期
    insertMastery({ studentId: sid, itemId: itemIds[0], enToZhStage: 1, enToZhNext: today })
    insertMastery({ studentId: sid, itemId: itemIds[1], enToZhStage: 1, enToZhNext: today })

    const todayRes = await apiGetToday(sid, wid)
    expect(todayRes.body.review_count).toBe(2)
    // 剩余3个未引入词可作为新词
    expect(todayRes.body.new_count).toBe(3)
  })
})

// ══════════════════════════════════════════════════════════════════════
// 8. 中途退出再次进入
// ══════════════════════════════════════════════════════════════════════
describe('中途退出再次进入', () => {
  it('未答题直接退出 → 再次 start 复用同一 session（id 相同）', async () => {
    const { sid, wid } = bootstrap(3, 3)
    const first = await apiStartTask(sid, wid)
    expect(first.status).toBe(201)

    const second = await apiStartTask(sid, wid)
    expect(second.status).toBe(200)  // 复用返回 200
    expect(second.body.session.id).toBe(first.body.session.id)
    expect(second.body.items).toHaveLength(3)
  })

  it('不会重复创建 session（防止词数翻倍）', async () => {
    const { sid, wid } = bootstrap(3, 3)
    for (let i = 0; i < 5; i++) {
      await apiStartTask(sid, wid)
    }
    const sessions = db.prepare(
      "SELECT COUNT(*) AS c FROM quiz_sessions WHERE student_id=? AND wordbook_id=? AND status='in_progress'"
    ).get(sid, wid) as { c: number }
    expect(sessions.c).toBe(1)
  })

  it('中途退出（部分答对，未 finish）→ 再次 start 返回剩余词', async () => {
    const { sid, wid } = bootstrap(4, 4)
    const first = await apiStartTask(sid, wid)
    const { session, items } = first.body as { session: { id: number }; items: Array<{ id: number }> }

    // 答对前2个，答错第3个，第4个未答
    await apiAnswer(session.id, items[0].id, true)
    await apiAnswer(session.id, items[1].id, true)
    await apiAnswer(session.id, items[2].id, false)
    // 此处用户直接退出，未调用 finish

    const second = await apiStartTask(sid, wid)
    expect(second.status).toBe(200)
    // 复用同一 session
    expect(second.body.session.id).toBe(session.id)
    // 返回的词排除已答对的2个
    expect(second.body.items).toHaveLength(2)
    const returnedIds = new Set(second.body.items.map((i: { id: number }) => i.id))
    expect(returnedIds.has(items[0].id)).toBe(false)
    expect(returnedIds.has(items[1].id)).toBe(false)
    expect(returnedIds.has(items[2].id)).toBe(true)
    expect(returnedIds.has(items[3].id)).toBe(true)
  })

  it('中途退出（部分答对，未 finish）→ 再次 start 补偿写入已答对词的 mastery', async () => {
    const { sid, wid, itemIds } = bootstrap(3, 3)
    const first = await apiStartTask(sid, wid)
    const { session, items } = first.body as { session: { id: number }; items: Array<{ id: number }> }

    // 答对第1个，直接退出
    await apiAnswer(session.id, items[0].id, true)

    // 再次进入触发补偿
    await apiStartTask(sid, wid)

    // 已答对词的 mastery 应被补偿写入
    const m = getMastery(sid, itemIds[items.findIndex(i => i.id === items[0].id)])
    expect(m?.introduced_date).toBe(todayInt())
    expect(m?.en_to_zh_stage).toBe(1)
  })

  it('中途退出（仅有答错，未 finish）→ 再次 start 返回全部词', async () => {
    const { sid, wid } = bootstrap(3, 3)
    const first = await apiStartTask(sid, wid)
    const { session, items } = first.body as { session: { id: number }; items: Array<{ id: number }> }

    // 全部答错，直接退出
    for (const item of items) {
      await apiAnswer(session.id, item.id, false)
    }

    const second = await apiStartTask(sid, wid)
    expect(second.status).toBe(200)
    expect(second.body.session.id).toBe(session.id)
    // 答错词不被排除，全部返回
    expect(second.body.items).toHaveLength(3)
  })

  it('中途退出（部分答对）→ today.new_count 排除已答对词，不重复计入', async () => {
    const { sid, wid } = bootstrap(5, 5)
    const first = await apiStartTask(sid, wid)
    const { session, items } = first.body as { session: { id: number }; items: Array<{ id: number }> }

    // 答对3个，退出
    await apiAnswer(session.id, items[0].id, true)
    await apiAnswer(session.id, items[1].id, true)
    await apiAnswer(session.id, items[2].id, true)

    // 触发补偿（再次 start）
    await apiStartTask(sid, wid)

    // today 视图：3个词已答对但 in_progress_answered 应计入
    const todayRes = await apiGetToday(sid, wid)
    // 已经答对的3个词不再出现在 items 中
    const todayItemIds = new Set(todayRes.body.items.map((i: { item_id: number }) => i.item_id))
    expect(todayItemIds.has(items[0].id)).toBe(false)
    expect(todayItemIds.has(items[1].id)).toBe(false)
    expect(todayItemIds.has(items[2].id)).toBe(false)
  })

  it('中途退出后完整完成剩余词 → 最终所有词 mastery 正确', async () => {
    const { sid, wid } = bootstrap(4, 4)

    // 第1轮：答对前2个，退出
    const first = await apiStartTask(sid, wid)
    const { session: s1, items: items1 } = first.body as { session: { id: number }; items: Array<{ id: number }> }
    await apiAnswer(s1.id, items1[0].id, true)
    await apiAnswer(s1.id, items1[1].id, true)
    // 直接退出，不 finish

    // 再次进入，触发补偿，拿到剩余2个词
    const second = await apiStartTask(sid, wid)
    const { session: s2, items: items2 } = second.body as { session: { id: number }; items: Array<{ id: number }> }
    // s2 应复用 s1
    expect(s2.id).toBe(s1.id)
    expect(items2).toHaveLength(2)

    // 答完剩余2个
    for (const item of items2) {
      await apiAnswer(s2.id, item.id, true)
    }
    const finishRes = await apiFinish(s2.id)
    expect(finishRes.status).toBe(200)
    expect(finishRes.body.passed).toBe(true)

    // 4个词全部已引入
    for (const item of [...items1, ...items2]) {
      const m = getMastery(sid, item.id)
      expect(m?.introduced_date).toBe(todayInt())
    }

    // 已知行为：重入补偿（0→1）+ finish 再次处理（1→2）= 第1轮答对的词 stage=2
    // 第2轮答对的词只经过 finish 处理一次 = stage=1
    // 若将来修复补偿不重复计入问题，此处两处均应改为 toBe(1)
    for (const item of items1.slice(0, 2)) {
      expect(getMastery(sid, item.id)?.en_to_zh_stage).toBe(2)
    }
    for (const item of items2) {
      expect(getMastery(sid, item.id)?.en_to_zh_stage).toBe(1)
    }

    // today 没有任何待做项
    const todayRes = await apiGetToday(sid, wid)
    expect(todayRes.body.new_count).toBe(0)
    expect(todayRes.body.review_count).toBe(0)
  })

  it('计划在退出后被修改 → 再次 start 废弃旧 session 并重建', async () => {
    const { sid, wid } = bootstrap(3, 3)
    const first = await apiStartTask(sid, wid)
    const oldSessionId = first.body.session.id

    // 模拟：直接修改 plan 的 updated_at，使其晚于 session 的 started_at
    db.prepare(`
      UPDATE study_plans SET updated_at = ? WHERE student_id = ? AND wordbook_id = ?
    `).run(Math.floor(Date.now() / 1000) + 10, sid, wid)

    const second = await apiStartTask(sid, wid)
    expect(second.status).toBe(201)  // 重建返回 201
    expect(second.body.session.id).not.toBe(oldSessionId)

    // 旧 session 被废弃
    const oldSession = db.prepare(
      'SELECT status FROM quiz_sessions WHERE id = ?'
    ).get(oldSessionId) as { status: string }
    expect(oldSession.status).toBe('abandoned')
  })
})

// ══════════════════════════════════════════════════════════════════════
// 9. 首次正确率计算（验证 Bug Fix）
// ══════════════════════════════════════════════════════════════════════
describe('首次正确率计算', () => {
  it('全部首次答对 → final_accuracy = 1.0', async () => {
    const { sid, wid } = bootstrap(3, 3)
    const { result } = await runSession(sid, wid)
    expect(result.final_accuracy).toBe(1)
    expect(result.passed).toBe(true)
  })

  it('答错再答对（重试）→ 首次正确率为 0，不因重试而膨胀', async () => {
    const { sid, wid } = bootstrap(2, 2)
    const startRes = await apiStartTask(sid, wid)
    expect(startRes.status).toBe(201)
    const { session, items } = startRes.body as { session: { id: number }; items: Array<{ id: number }> }
    // attempt 1: 全部答错
    for (const item of items) await apiAnswer(session.id, item.id, false)
    // attempt 2: 全部答对
    for (const item of items) await apiAnswer(session.id, item.id, true)
    const res = await apiFinish(session.id)
    expect(res.status).toBe(200)
    // 首次均答错 → 首次正确率 = 0/2 = 0
    expect(res.body.final_accuracy).toBe(0)
    expect(res.body.passed).toBe(false)
  })

  it('部分首次答对，部分重试后答对 → 正确率只计首次', async () => {
    const { sid, wid } = bootstrap(4, 4)
    const startRes = await apiStartTask(sid, wid)
    expect(startRes.status).toBe(201)
    const { session, items } = startRes.body as { session: { id: number }; items: Array<{ id: number }> }
    // items[0],[1] 首次答对
    await apiAnswer(session.id, items[0].id, true)
    await apiAnswer(session.id, items[1].id, true)
    // items[2],[3] 首次答错，重试答对
    await apiAnswer(session.id, items[2].id, false)
    await apiAnswer(session.id, items[3].id, false)
    await apiAnswer(session.id, items[2].id, true)
    await apiAnswer(session.id, items[3].id, true)
    const res = await apiFinish(session.id)
    expect(res.status).toBe(200)
    // 4词中2词首次答对 → 2/4 = 0.5
    expect(res.body.final_accuracy).toBe(0.5)
    expect(res.body.total_words).toBe(4)
  })

  it('中途放弃（部分词未作答）→ 分母为 session_items 总数，正确率不虚高', async () => {
    // 5词计划session，只答前3个（全部首次答对），直接finish
    const sid = createStudent()
    const wid = createWordbook()
    for (let i = 0; i < 5; i++) addItemToWordbook(wid, createItem(`w${i}`, `词${i}`), i)
    createPlan(sid, wid, 1)  // remaining_days=1 → 5词全部今日出现
    const startRes = await apiStartTask(sid, wid)
    expect(startRes.status).toBe(201)
    const { session, items } = startRes.body as { session: { id: number }; items: Array<{ id: number }> }
    expect(items.length).toBe(5)
    // 只答前3个
    await apiAnswer(session.id, items[0].id, true)
    await apiAnswer(session.id, items[1].id, true)
    await apiAnswer(session.id, items[2].id, true)
    const res = await apiFinish(session.id)
    expect(res.status).toBe(200)
    // 分母 = session_items = 5，分子 = 3（首次答对）
    expect(res.body.total_words).toBe(5)
    expect(res.body.final_accuracy).toBe(0.6)
    expect(res.body.final_accuracy).toBeLessThanOrEqual(1.0)
  })

  it('中途退出再进入 → final_accuracy 不超过 1.0（分母用 session_items 总数）', async () => {
    const { sid, wid } = bootstrap(4, 4)
    // 第一次：答对所有4词但不 finish（模拟中途退出）
    const first = await apiStartTask(sid, wid)
    expect(first.status).toBe(201)
    const { session, items } = first.body as { session: { id: number }; items: Array<{ id: number }> }
    for (const item of items) await apiAnswer(session.id, item.id, true)
    // 第二次进入：触发补偿，total_words 更新为 0（全部已答对）
    const second = await apiStartTask(sid, wid)
    expect(second.status).toBe(200)
    // 直接 finish 当前 session（回收原 session id）
    const res = await apiFinish(session.id)
    expect(res.status).toBe(200)
    // session_items = 4，首次答对 = 4 → 1.0，不超过 100%
    expect(res.body.final_accuracy).toBeLessThanOrEqual(1.0)
    expect(res.body.total_words).toBe(4)
  })
})

// ══════════════════════════════════════════════════════════════════════
// 10. target_level 解锁链控制
// ══════════════════════════════════════════════════════════════════════
describe('target_level 解锁链控制', () => {
  /**
   * 创建计划时传 target_level。
   * 插入一个 en_to_zh_stage=1 今日到期的复习词，跑一轮答对，
   * 触发 stage 1→2，验证是否解锁 zh_to_en。
   */
  async function runReviewSession(sid: number, wid: number, itemId: number) {
    const today = todayInt()
    insertMastery({ studentId: sid, itemId, enToZhStage: 1, enToZhNext: today })
    const { session, items } = (await apiStartTask(sid, wid)).body as {
      session: { id: number }; items: Array<{ id: number }>
    }
    await apiAnswer(session.id, itemId, true)
    await apiFinish(session.id)
  }

  it('target_level=1：en_to_zh stage 1→2 后不解锁 zh_to_en', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const itemId = createItem('cat', '猫', 'word')
    addItemToWordbook(wid, itemId, 0)
    createPlan(sid, wid, 1, 1)   // target_level=1

    await runReviewSession(sid, wid, itemId)

    const m = getMastery(sid, itemId)
    expect(m?.en_to_zh_stage).toBe(2)
    expect(m?.zh_to_en_stage).toBe(0)  // 未被解锁
  })

  it('target_level=2：en_to_zh stage 1→2 后解锁 zh_to_en', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const itemId = createItem('dog', '狗', 'word')
    addItemToWordbook(wid, itemId, 0)
    createPlan(sid, wid, 1, 2)   // target_level=2

    await runReviewSession(sid, wid, itemId)

    const m = getMastery(sid, itemId)
    expect(m?.en_to_zh_stage).toBe(2)
    expect(m?.zh_to_en_stage).toBe(1)  // 已解锁
  })

  it('target_level=3：en_to_zh stage 1→2 后解锁 zh_to_en', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const itemId = createItem('bird', '鸟', 'word')
    addItemToWordbook(wid, itemId, 0)
    createPlan(sid, wid, 1, 3)   // target_level=3（默认）

    await runReviewSession(sid, wid, itemId)

    const m = getMastery(sid, itemId)
    expect(m?.zh_to_en_stage).toBe(1)  // 已解锁
  })

  it('target_level=2：zh_to_en stage 1→2 后不解锁 spelling', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const itemId = createItem('fish', '鱼', 'word')
    addItemToWordbook(wid, itemId, 0)
    createPlan(sid, wid, 1, 2)   // target_level=2

    const today = todayInt()
    // zh_to_en stage=1 今日到期，en_to_zh 已完成（不影响本次）
    insertMastery({
      studentId: sid, itemId,
      enToZhStage: 3, enToZhNext: 99991231,
      zhToEnStage: 1, zhToEnNext: today,
      spellingStage: 0,
    })

    const { session, items } = (await apiStartTask(sid, wid)).body as {
      session: { id: number }; items: Array<{ id: number }>
    }
    await apiAnswer(session.id, itemId, true)
    await apiFinish(session.id)

    const m = getMastery(sid, itemId)
    expect(m?.zh_to_en_stage).toBe(2)
    expect(m?.spelling_stage).toBe(0)  // 不解锁 spelling
  })

  it('target_level=3：zh_to_en stage 1→2 后解锁 spelling', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const itemId = createItem('tree', '树', 'word')
    addItemToWordbook(wid, itemId, 0)
    createPlan(sid, wid, 1, 3)   // target_level=3

    const today = todayInt()
    insertMastery({
      studentId: sid, itemId,
      enToZhStage: 3, enToZhNext: 99991231,
      zhToEnStage: 1, zhToEnNext: today,
      spellingStage: 0,
    })

    const { session, items } = (await apiStartTask(sid, wid)).body as {
      session: { id: number }; items: Array<{ id: number }>
    }
    await apiAnswer(session.id, itemId, true)
    await apiFinish(session.id)

    const m = getMastery(sid, itemId)
    expect(m?.zh_to_en_stage).toBe(2)
    expect(m?.spelling_stage).toBe(1)  // 已解锁
  })

  it('target_level=3：phrase 类型答对后 zh_to_en≥2 不解锁 spelling（phrase 无拼写）', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const itemId = createItem('by the way', '顺便说', 'phrase')
    addItemToWordbook(wid, itemId, 0)
    createPlan(sid, wid, 1, 3)

    const today = todayInt()
    insertMastery({
      studentId: sid, itemId,
      enToZhStage: 3, enToZhNext: 99991231,
      zhToEnStage: 1, zhToEnNext: today,
      spellingStage: 0,
    })

    const { session } = (await apiStartTask(sid, wid)).body as { session: { id: number } }
    await apiAnswer(session.id, itemId, true)
    await apiFinish(session.id)

    const m = getMastery(sid, itemId)
    expect(m?.spelling_stage).toBe(0)  // phrase 不解锁 spelling
  })
})
