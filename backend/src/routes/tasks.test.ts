/**
 * tasks 路由测试
 *
 * 覆盖：
 * 1. 纯函数 nextReviewDate —— 艾宾浩斯复习间隔计算
 * 2. GET /api/tasks/today  —— 今日任务 API
 * 3. GET /api/tasks/forecast —— 学习负载预测（含 target_level 过滤）
 */
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import db from '../db/client'
import app from '../app'
import { setupTestDb, createStudent, createWordbook, createItem, addItemToWordbook, createPlan } from '../__tests__/helpers'
import { nextReviewDate, todayInt } from './tasks'

// ─────────────────────────────────────────────
// 1. 纯函数：nextReviewDate
// ─────────────────────────────────────────────
describe('nextReviewDate()', () => {
  it('stage 0 → 当天（间隔 0 天）', () => {
    expect(nextReviewDate(0, 20240101)).toBe(20240101)
  })
  it('stage 1 → +1 天', () => {
    expect(nextReviewDate(1, 20240101)).toBe(20240102)
  })
  it('stage 2 → +3 天', () => {
    expect(nextReviewDate(2, 20240101)).toBe(20240104)
  })
  it('stage 3 → +7 天', () => {
    expect(nextReviewDate(3, 20240101)).toBe(20240108)
  })
  it('stage 4 → +14 天', () => {
    expect(nextReviewDate(4, 20240101)).toBe(20240115)
  })
  it('stage 5 → +30 天', () => {
    expect(nextReviewDate(5, 20240101)).toBe(20240131)
  })
  it('stage > 5 → 同 stage 5（上限 30 天）', () => {
    expect(nextReviewDate(6, 20240101)).toBe(20240131)
    expect(nextReviewDate(99, 20240101)).toBe(20240131)
  })
  it('跨月：1月31日 +1天 → 2月1日', () => {
    expect(nextReviewDate(1, 20240131)).toBe(20240201)
  })
  it('跨年：12月31日 +3天 → 1月3日', () => {
    expect(nextReviewDate(2, 20231231)).toBe(20240103)
  })
  it('2月跨月：2月28日 +3天 → 3月2日（非闰年）', () => {
    expect(nextReviewDate(2, 20230228)).toBe(20230303)
  })
  it('2月跨月：2月28日 +3天 → 3月2日（闰年）', () => {
    expect(nextReviewDate(2, 20240228)).toBe(20240302)
  })
})

// ─────────────────────────────────────────────
// 2. API：GET /api/tasks/today
// ─────────────────────────────────────────────
describe('GET /api/tasks/today', () => {
  setupTestDb()

  it('缺少参数时返回 400', async () => {
    const res = await request(app).get('/api/tasks/today')
    expect(res.status).toBe(400)
  })

  it('没有激活计划时返回 404', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const res = await request(app).get(`/api/tasks/today?student_id=${sid}&wordbook_id=${wid}`)
    expect(res.status).toBe(404)
  })

  it('有计划但词本为空时新词数为 0', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    createPlan(sid, wid)
    const res = await request(app).get(`/api/tasks/today?student_id=${sid}&wordbook_id=${wid}`)
    expect(res.status).toBe(200)
    expect(res.body.new_count).toBe(0)
    expect(res.body.review_count).toBe(0)
  })

  it('新词数受 remaining_days 限制', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    // 加 5 个词，remaining_days=2，期望出现 ceil(5/2)=3 个新词
    for (let i = 0; i < 5; i++) {
      addItemToWordbook(wid, createItem(`word${i}`, `词${i}`), i)
    }
    createPlan(sid, wid, 2)
    const res = await request(app).get(`/api/tasks/today?student_id=${sid}&wordbook_id=${wid}`)
    expect(res.status).toBe(200)
    expect(res.body.new_count).toBe(3)
  })

  it('响应包含必要字段', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    addItemToWordbook(wid, createItem('apple', '苹果'))
    createPlan(sid, wid)
    const res = await request(app).get(`/api/tasks/today?student_id=${sid}&wordbook_id=${wid}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      plan: expect.any(Object),
      review_count: expect.any(Number),
      new_count: expect.any(Number),
      remaining_new: expect.any(Number),
      items: expect.any(Array),
    })
  })
})

// ─────────────────────────────────────────────
// 3. API：GET /api/tasks/forecast — target_level 过滤
// ─────────────────────────────────────────────
describe('GET /api/tasks/forecast', () => {
  setupTestDb()
  /** 向 DB 写入已引入词的掌握度，配置 zh_to_en / spelling 到期 */
  function insertMastery(opts: {
    studentId: number
    itemId: number
    enToZhStage?: number
    enToZhNext?: number
    zhToEnStage?: number
    zhToEnNext?: number
    spellingStage?: number
    spellingNext?: number
  }) {
    const today = todayInt()
    db.prepare(`
      INSERT INTO student_mastery
        (student_id, item_id, introduced_date,
         en_to_zh_stage, en_to_zh_next,
         zh_to_en_stage, zh_to_en_next,
         spelling_stage, spelling_next)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      opts.studentId, opts.itemId, today,
      opts.enToZhStage ?? 2,    opts.enToZhNext  ?? 99991231,
      opts.zhToEnStage ?? 0,    opts.zhToEnNext  ?? 0,
      opts.spellingStage ?? 0,  opts.spellingNext ?? 0,
    )
  }

  it('缺少参数返回 400', async () => {
    const res = await request(app).get('/api/tasks/forecast?student_id=1')
    expect(res.status).toBe(400)
  })

  it('无激活计划返回 404', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const res = await request(app).get(`/api/tasks/forecast?student_id=${sid}&wordbook_id=${wid}`)
    expect(res.status).toBe(404)
  })

  it('响应包含 forecast / history / projected_completion_date 字段', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    addItemToWordbook(wid, createItem('cat', '猫'), 0)
    createPlan(sid, wid, 7)
    const res = await request(app).get(`/api/tasks/forecast?student_id=${sid}&wordbook_id=${wid}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      forecast: expect.any(Array),
      history:  expect.any(Array),
      total_unintroduced: expect.any(Number),
      daily_peak: expect.any(Number),
    })
  })

  it('target_level=1：仅含 en_to_zh 复习词计入 review_count，zh_to_en 到期词被忽略', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const today = todayInt()

    // 词 A：en_to_zh 今日到期
    const itemA = createItem('sky', '天空', 'word')
    addItemToWordbook(wid, itemA, 0)
    insertMastery({ studentId: sid, itemId: itemA, enToZhStage: 1, enToZhNext: today })

    // 词 B：zh_to_en 今日到期（en_to_zh 未到期）
    const itemB = createItem('sea', '大海', 'word')
    addItemToWordbook(wid, itemB, 1)
    insertMastery({ studentId: sid, itemId: itemB, enToZhStage: 2, enToZhNext: 99991231, zhToEnStage: 1, zhToEnNext: today })

    createPlan(sid, wid, 30, 1)  // target_level=1

    const res = await request(app).get(`/api/tasks/forecast?student_id=${sid}&wordbook_id=${wid}`)
    expect(res.status).toBe(200)

    // forecast[0] = 今天的预测
    const day0 = res.body.forecast[0]
    // 词 A 的 en_to_zh 到期 → 计入
    // 词 B 的 zh_to_en 到期 → target_level=1 下被过滤，不计入
    expect(day0.review_count).toBe(1)
  })

  it('target_level=2：en_to_zh 和 zh_to_en 到期词都计入，spelling 被忽略', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const today = todayInt()

    // 词 A：en_to_zh 今日到期
    const itemA = createItem('moon', '月亮', 'word')
    addItemToWordbook(wid, itemA, 0)
    insertMastery({ studentId: sid, itemId: itemA, enToZhStage: 1, enToZhNext: today })

    // 词 B：zh_to_en 今日到期
    const itemB = createItem('star', '星星', 'word')
    addItemToWordbook(wid, itemB, 1)
    insertMastery({ studentId: sid, itemId: itemB, enToZhStage: 2, enToZhNext: 99991231, zhToEnStage: 1, zhToEnNext: today })

    // 词 C：spelling 今日到期
    const itemC = createItem('sun', '太阳', 'word')
    addItemToWordbook(wid, itemC, 2)
    insertMastery({
      studentId: sid, itemId: itemC,
      enToZhStage: 3, enToZhNext: 99991231,
      zhToEnStage: 3, zhToEnNext: 99991231,
      spellingStage: 1, spellingNext: today,
    })

    createPlan(sid, wid, 30, 2)  // target_level=2

    const res = await request(app).get(`/api/tasks/forecast?student_id=${sid}&wordbook_id=${wid}`)
    expect(res.status).toBe(200)

    const day0 = res.body.forecast[0]
    // 词 A (en_to_zh) + 词 B (zh_to_en) 计入 = 2
    // 词 C (spelling) 被过滤
    expect(day0.review_count).toBe(2)
  })

  it('target_level=3：en_to_zh / zh_to_en / spelling 全部计入', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const today = todayInt()

    const itemA = createItem('wind', '风', 'word')
    addItemToWordbook(wid, itemA, 0)
    insertMastery({ studentId: sid, itemId: itemA, enToZhStage: 1, enToZhNext: today })

    const itemB = createItem('rain', '雨', 'word')
    addItemToWordbook(wid, itemB, 1)
    insertMastery({ studentId: sid, itemId: itemB, enToZhStage: 2, enToZhNext: 99991231, zhToEnStage: 1, zhToEnNext: today })

    const itemC = createItem('snow', '雪', 'word')
    addItemToWordbook(wid, itemC, 2)
    insertMastery({
      studentId: sid, itemId: itemC,
      enToZhStage: 3, enToZhNext: 99991231,
      zhToEnStage: 3, zhToEnNext: 99991231,
      spellingStage: 1, spellingNext: today,
    })

    createPlan(sid, wid, 30, 3)  // target_level=3

    const res = await request(app).get(`/api/tasks/forecast?student_id=${sid}&wordbook_id=${wid}`)
    expect(res.status).toBe(200)

    const day0 = res.body.forecast[0]
    expect(day0.review_count).toBe(3)  // 三种类型全部计入
  })

  it('preview_remaining_days / preview_daily_peak 覆盖计划值', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    for (let i = 0; i < 10; i++) addItemToWordbook(wid, createItem(`w${i}`, `词${i}`), i)
    createPlan(sid, wid, 30)  // remaining_days=30

    // 用 preview_remaining_days=1 → 今天就想引入所有词
    const res = await request(app).get(
      `/api/tasks/forecast?student_id=${sid}&wordbook_id=${wid}&preview_remaining_days=1&preview_daily_peak=100`
    )
    expect(res.status).toBe(200)
    // forecast[0] 的 new_count 应接近 total_unintroduced（preview 参数生效）
    expect(res.body.forecast[0].new_count).toBe(10)
  })
})
