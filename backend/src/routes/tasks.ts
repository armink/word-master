/**
 * 今日任务 API
 *
 * GET  /api/tasks/today?student_id=&wordbook_id=       — 计算今日任务概览
 * POST /api/tasks/start                                — 创建今日 session（含 per-item quiz_type）
 * POST /api/tasks/extra                                — 继续学习：追加 N 个新词并创建 session
 * POST /api/tasks/complete                             — 完成今日打卡（remaining_days -1，completed_days +1）
 * GET  /api/tasks/forecast?student_id=&wordbook_id=    — 过去+未来学习负载预测曲线
 * GET  /api/tasks/stats?student_id=&wordbook_id=       — 单词本整体学习进度统计
 */
import { Router } from 'express'
import db from '../db/client'
import type { StudyPlanRow, TodayTask, TodayTaskItem, QuizType, QuizSessionRow, ForecastDay } from '../types/index'

const router = Router()

/** 今天的 YYYYMMDD 整数 */
export function todayInt(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

/**
 * 将 YYYYMMDD 整数加减若干天
 */
export function addDaysToInt(base: number, days: number): number {
  if (days === 0) return base
  const s = String(base)
  const d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`)
  d.setDate(d.getDate() + days)
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

/**
 * 艾宾浩斯间隔（天）：答对后按当前 stage 决定下次复习时间
 * stage 1→2: +1d, 2→3: +3d, 3→4: +7d, 4→5: +14d, 5 max: +30d
 *
 * 错误权重修正（error_weight > 0 时压缩间隔）：
 *   actual_days = max(1, floor(base_days × e^(−0.35 × weight)))
 *
 * | weight | 乘数  | 举例 base=7d |
 * |--------|-------|-------------|
 * | 0      | ×1.00 | 7 天        |
 * | 1      | ×0.70 | 5 天        |
 * | 2      | ×0.50 | 4 天        |
 * | 3      | ×0.35 | 2~3 天      |
 * | 5      | ×0.17 | 1 天        |
 */
const EBBINGHAUS_INTERVALS = [0, 1, 3, 7, 14, 30]

export function nextReviewDate(stage: number, base: number = todayInt(), errorWeight = 0): number {
  const baseDays = stage >= 5 ? 30 : EBBINGHAUS_INTERVALS[Math.min(stage, 5)]
  const actualDays = baseDays === 0
    ? 0
    : Math.max(1, Math.floor(baseDays * Math.exp(-0.35 * errorWeight)))
  return addDaysToInt(base, actualDays)
}

/** 根据当前 mastery 决定本次该考哪个阶段（最高已解锁且到期的阶段） */
export function pickQuizType(m: {
  en_to_zh_stage: number, en_to_zh_next: number,
  zh_to_en_stage: number, zh_to_en_next: number,
  spelling_stage: number, spelling_next: number,
  item_type: string,
}, today: number): QuizType | null {
  if (m.item_type === 'word' && m.spelling_stage > 0 && m.spelling_next > 0 && m.spelling_next <= today) return 'spelling'
  if (m.zh_to_en_stage > 0 && m.zh_to_en_next > 0 && m.zh_to_en_next <= today) return 'zh_to_en'
  if (m.en_to_zh_stage > 0 && m.en_to_zh_next > 0 && m.en_to_zh_next <= today) return 'en_to_zh'
  return null
}

/**
 * 构建今日可测词列表（不含 session 创建）
 *
 * 调度逻辑：
 * 1. 复习词：到期词按 error_weight 降序排列（错多的优先），超出 daily_peak 的截断（方案A：次日自动到期）
 * 2. 新词配额：ceil(totalUnintroduced / max(1, remaining_days))，但不超过 daily_peak - reviewCount
 * 3. 今日已引入数从配额中扣减
 */
function buildTodayItems(
  studentId: number,
  wordbookId: number,
  plan: StudyPlanRow,
): {
  items: TodayTaskItem[]
  in_progress_answered: number
  today_introduced: number
  total_unintroduced: number
} {
  const today = todayInt()
  const dailyPeak = plan.daily_peak ?? 50

  // ── 1. 到期复习词（按 error_weight 降序优先，超峰值截断）──────────
  const reviewRows = db.prepare(`
    SELECT sm.*, i.type AS item_type
    FROM student_mastery sm
    JOIN wordbook_items wi ON wi.item_id = sm.item_id AND wi.wordbook_id = ?
    JOIN items i ON i.id = sm.item_id
    WHERE sm.student_id = ?
      AND sm.introduced_date > 0
      AND (
        (sm.en_to_zh_stage > 0 AND sm.en_to_zh_next <= ? AND sm.en_to_zh_next > 0)
        OR
        (sm.zh_to_en_stage > 0 AND sm.zh_to_en_next <= ? AND sm.zh_to_en_next > 0)
        OR
        (sm.spelling_stage > 0 AND sm.spelling_next <= ? AND sm.spelling_next > 0 AND i.type = 'word')
      )
    ORDER BY COALESCE(sm.error_weight, 0) DESC, wi.sort_order ASC, i.id ASC
  `).all(wordbookId, studentId, today, today, today) as any[]

  // 排除在进行中 session 里已答对的词
  const correctInProgress = new Set(
    (db.prepare(`
      SELECT DISTINCT qa.item_id
      FROM quiz_answers qa
      JOIN quiz_sessions qs ON qs.id = qa.session_id
      WHERE qs.student_id = ? AND qs.wordbook_id = ? AND qs.status = 'in_progress'
        AND qa.is_correct = 1
    `).all(studentId, wordbookId) as { item_id: number }[]).map(r => r.item_id)
  )

  const allReviewItems: TodayTaskItem[] = reviewRows
    .map(row => {
      const qt = pickQuizType(row, today)
      return qt ? { item_id: row.item_id, quiz_type: qt, is_new: false } : null
    })
    .filter(Boolean)
    .filter(item => !correctInProgress.has((item as TodayTaskItem).item_id)) as TodayTaskItem[]

  // 应用峰值上限（超出的词次日自动到期，无需额外操作）
  const reviewItems = allReviewItems.slice(0, dailyPeak)

  // ── 2. 今日新词配额计算 ──────────────────────────────────────────
  const todayIntroduced = (db.prepare(`
    SELECT COUNT(*) AS c FROM student_mastery sm
    JOIN wordbook_items wi ON wi.item_id = sm.item_id AND wi.wordbook_id = ?
    WHERE sm.student_id = ? AND sm.introduced_date = ?
  `).get(wordbookId, studentId, today) as { c: number }).c

  // 还未引入的词数（introduced_date = 0 或不在 mastery 表中）
  const totalUnintroduced = (db.prepare(`
    SELECT COUNT(*) AS c FROM wordbook_items wi
    WHERE wi.wordbook_id = ?
      AND wi.item_id NOT IN (
        SELECT item_id FROM student_mastery WHERE student_id = ? AND introduced_date > 0
      )
  `).get(wordbookId, studentId) as { c: number }).c

  // 今日配额所基于的总量 = 今日还未学的 + 今日已学的
  // （可以理解为：今天开始时有多少词需要今天完成）
  const totalForQuota = totalUnintroduced + todayIntroduced

  // 每日新词配额 = ceil(totalForQuota / max(1, remaining_days))
  const remainingDays = Math.max(1, plan.remaining_days ?? 30)
  const dailyNewQuota = Math.ceil(totalForQuota / remainingDays)

  // 今日新词槽位 = daily_peak - 复习词数；与配额取较小值，再扣除今日已引入数
  const newSlots = Math.max(0, dailyPeak - reviewItems.length)
  const dailyNewForSession = Math.max(0, Math.min(dailyNewQuota, newSlots) - todayIntroduced)

  const newRows = db.prepare(`
    SELECT i.id AS item_id
    FROM wordbook_items wi
    JOIN items i ON i.id = wi.item_id
    WHERE wi.wordbook_id = ?
      AND i.id NOT IN (
        SELECT item_id FROM student_mastery WHERE student_id = ? AND introduced_date > 0
      )
    ORDER BY wi.sort_order ASC, i.id ASC
    LIMIT ?
  `).all(wordbookId, studentId, dailyNewForSession) as { item_id: number }[]

  const newItems: TodayTaskItem[] = newRows
    .filter(r => !correctInProgress.has(r.item_id))
    .map(r => ({
      item_id: r.item_id,
      quiz_type: 'en_to_zh' as QuizType,
      is_new: true,
    }))

  return {
    items: [...reviewItems, ...newItems],
    in_progress_answered: correctInProgress.size,
    today_introduced: todayIntroduced,
    total_unintroduced: totalUnintroduced,
  }
}

// ── GET /api/tasks/today ──────────────────────────────────────────
router.get('/today', (req, res) => {
  const { student_id, wordbook_id } = req.query
  if (!student_id || !wordbook_id) {
    res.status(400).json({ error: '缺少 student_id / wordbook_id' }); return
  }
  const sid = Number(student_id), wid = Number(wordbook_id)

  const plan = db.prepare(
    "SELECT * FROM study_plans WHERE student_id = ? AND wordbook_id = ? AND status = 'active'"
  ).get(sid, wid) as StudyPlanRow | undefined
  if (!plan) { res.status(404).json({ error: '未找到激活的学习计划' }); return }

  const { items, in_progress_answered, today_introduced, total_unintroduced } = buildTodayItems(sid, wid, plan)
  const reviewCount = items.filter(i => !i.is_new).length
  const newCount = items.filter(i => i.is_new).length

  const result: TodayTask = {
    plan,
    review_count: reviewCount,
    new_count: newCount,
    remaining_new: Math.max(0, total_unintroduced - newCount),
    today_introduced,
    in_progress_answered,
    items,
  }
  res.json(result)
})

// ── POST /api/tasks/start ─────────────────────────────────────────
router.post('/start', (req, res) => {
  const { student_id, wordbook_id } = req.body
  if (!student_id || !wordbook_id) {
    res.status(400).json({ error: '缺少 student_id / wordbook_id' }); return
  }
  const sid = Number(student_id), wid = Number(wordbook_id)

  const plan = db.prepare(
    "SELECT * FROM study_plans WHERE student_id = ? AND wordbook_id = ? AND status = 'active'"
  ).get(sid, wid) as StudyPlanRow | undefined
  if (!plan) { res.status(404).json({ error: '未找到激活的学习计划' }); return }

  const existingSession = db.prepare(`
    SELECT * FROM quiz_sessions
    WHERE student_id = ? AND wordbook_id = ? AND status = 'in_progress'
    ORDER BY started_at DESC LIMIT 1
  `).get(sid, wid) as QuizSessionRow | undefined
  if (existingSession) {
    if (existingSession.started_at >= plan.updated_at) {
      const correctAnswers = db.prepare(`
        SELECT DISTINCT qa.item_id, si.quiz_type
        FROM quiz_answers qa
        JOIN session_items si ON si.session_id = qa.session_id AND si.item_id = qa.item_id
        WHERE qa.session_id = ? AND qa.is_correct = 1
      `).all(existingSession.id) as { item_id: number; quiz_type: string }[]
      const correctSet = new Set(correctAnswers.map(r => r.item_id))

      if (correctSet.size > 0) {
        const now = Math.floor(Date.now() / 1000)
        const today = todayInt()
        type MRow = { en_to_zh_stage: number; zh_to_en_stage: number; spelling_stage: number }
        db.transaction(() => {
          for (const { item_id, quiz_type } of correctAnswers) {
            const item = db.prepare('SELECT type FROM items WHERE id = ?').get(item_id) as { type: string }
            db.prepare('INSERT OR IGNORE INTO student_mastery (student_id, item_id, spelling_level) VALUES (?, ?, ?)')
              .run(existingSession.student_id, item_id, item.type === 'phrase' ? null : 0)
            const m = db.prepare(
              'SELECT en_to_zh_stage, zh_to_en_stage, spelling_stage FROM student_mastery WHERE student_id=? AND item_id=?'
            ).get(existingSession.student_id, item_id) as MRow | undefined
            if (!m) continue

            if (quiz_type === 'en_to_zh') {
              const ns = Math.min(5, m.en_to_zh_stage + 1)
              db.prepare(`
                UPDATE student_mastery
                SET introduced_date = CASE WHEN introduced_date = 0 THEN ? ELSE introduced_date END,
                    en_to_zh_stage = ?, en_to_zh_next = ?,
                    en_to_zh_level = MIN(100, en_to_zh_level + 10),
                    last_reviewed_at = ?, updated_at = ?
                WHERE student_id = ? AND item_id = ?
              `).run(today, ns, nextReviewDate(ns), now, now, existingSession.student_id, item_id)
              if (ns >= 2 && m.zh_to_en_stage === 0) {
                db.prepare('UPDATE student_mastery SET zh_to_en_stage=1, zh_to_en_next=?, updated_at=? WHERE student_id=? AND item_id=?')
                  .run(nextReviewDate(1), now, existingSession.student_id, item_id)
              }
            } else if (quiz_type === 'zh_to_en') {
              const ns = Math.min(5, m.zh_to_en_stage + 1)
              db.prepare(`
                UPDATE student_mastery
                SET zh_to_en_stage=?, zh_to_en_next=?,
                    zh_to_en_level = MIN(100, zh_to_en_level + 10),
                    last_reviewed_at=?, updated_at=?
                WHERE student_id=? AND item_id=?
              `).run(ns, nextReviewDate(ns), now, now, existingSession.student_id, item_id)
              if (ns >= 2 && m.spelling_stage === 0 && item.type === 'word') {
                db.prepare('UPDATE student_mastery SET spelling_stage=1, spelling_next=?, updated_at=? WHERE student_id=? AND item_id=?')
                  .run(nextReviewDate(1), now, existingSession.student_id, item_id)
              }
            } else if (quiz_type === 'spelling' && item.type === 'word') {
              const ns = Math.min(5, m.spelling_stage + 1)
              db.prepare(`
                UPDATE student_mastery
                SET spelling_stage=?, spelling_next=?,
                    spelling_level = MIN(100, COALESCE(spelling_level, 0) + 10),
                    last_reviewed_at=?, updated_at=?
                WHERE student_id=? AND item_id=?
              `).run(ns, nextReviewDate(ns), now, now, existingSession.student_id, item_id)
            }
          }
        })()
      }

      const allItems = db.prepare(`
        SELECT i.*, si.quiz_type AS item_quiz_type, si.sort_order
        FROM session_items si
        JOIN items i ON i.id = si.item_id
        WHERE si.session_id = ?
        ORDER BY si.sort_order ASC
      `).all(existingSession.id) as any[]
      const remainingItems = allItems.filter(item => !correctSet.has(item.id))

      if (correctSet.size > 0) {
        db.prepare('UPDATE quiz_sessions SET total_words=? WHERE id=?').run(remainingItems.length, existingSession.id)
      }
      const updatedSession = db.prepare('SELECT * FROM quiz_sessions WHERE id=?').get(existingSession.id)
      res.json({ session: updatedSession, items: remainingItems })
      return
    }
    db.prepare(`UPDATE quiz_sessions SET status = 'abandoned' WHERE id = ?`).run(existingSession.id)
  }

  const { items: taskItems } = buildTodayItems(sid, wid, plan)
  if (taskItems.length === 0) {
    res.status(400).json({ error: '今日没有待学习/复习的词条' }); return
  }

  const result = db.transaction(() => {
    const sessionRes = db.prepare(`
      INSERT INTO quiz_sessions (student_id, wordbook_id, quiz_type, total_words)
      VALUES (?, ?, 'en_to_zh', ?)
    `).run(sid, wid, taskItems.length)
    const sessionId = sessionRes.lastInsertRowid

    const insertItem = db.prepare(
      'INSERT INTO session_items (session_id, item_id, quiz_type, sort_order) VALUES (?, ?, ?, ?)'
    )
    taskItems.forEach((item, idx) => {
      insertItem.run(sessionId, item.item_id, item.quiz_type, idx)
    })

    const itemDetails = db.prepare(`
      SELECT i.*, si.quiz_type AS item_quiz_type, si.sort_order
      FROM session_items si
      JOIN items i ON i.id = si.item_id
      WHERE si.session_id = ?
      ORDER BY si.sort_order ASC
    `).all(sessionId)

    const session = db.prepare('SELECT * FROM quiz_sessions WHERE id = ?').get(sessionId)
    return { session, items: itemDetails }
  })()

  res.status(201).json(result)
})

// ── POST /api/tasks/extra ─────────────────────────────────────────
router.post('/extra', (req, res) => {
  const { student_id, wordbook_id, extra_count } = req.body
  if (!student_id || !wordbook_id || !extra_count) {
    res.status(400).json({ error: '缺少 student_id / wordbook_id / extra_count' }); return
  }
  const sid = Number(student_id), wid = Number(wordbook_id)
  const count = Math.min(Math.max(1, Number(extra_count)), 50)

  const plan = db.prepare(
    "SELECT * FROM study_plans WHERE student_id = ? AND wordbook_id = ? AND status = 'active'"
  ).get(sid, wid) as StudyPlanRow | undefined
  if (!plan) { res.status(404).json({ error: '未找到激活的学习计划' }); return }

  const newRows = db.prepare(`
    SELECT i.id AS item_id
    FROM wordbook_items wi
    JOIN items i ON i.id = wi.item_id
    WHERE wi.wordbook_id = ?
      AND i.id NOT IN (
        SELECT item_id FROM student_mastery WHERE student_id = ? AND introduced_date > 0
      )
    ORDER BY wi.sort_order ASC, i.id ASC
    LIMIT ?
  `).all(wid, sid, count) as { item_id: number }[]

  if (newRows.length === 0) {
    res.status(400).json({ error: '没有更多未学习的新词了' }); return
  }

  const taskItems: TodayTaskItem[] = newRows.map(r => ({
    item_id: r.item_id,
    quiz_type: 'en_to_zh' as QuizType,
    is_new: true,
  }))

  const result = db.transaction(() => {
    const sessionRes = db.prepare(`
      INSERT INTO quiz_sessions (student_id, wordbook_id, quiz_type, total_words)
      VALUES (?, ?, 'en_to_zh', ?)
    `).run(sid, wid, taskItems.length)
    const sessionId = sessionRes.lastInsertRowid

    const insertItem = db.prepare(
      'INSERT INTO session_items (session_id, item_id, quiz_type, sort_order) VALUES (?, ?, ?, ?)'
    )
    taskItems.forEach((item, idx) => insertItem.run(sessionId, item.item_id, item.quiz_type, idx))

    const itemDetails = db.prepare(`
      SELECT i.*, si.quiz_type AS item_quiz_type, si.sort_order
      FROM session_items si
      JOIN items i ON i.id = si.item_id
      WHERE si.session_id = ?
      ORDER BY si.sort_order ASC
    `).all(sessionId)

    const session = db.prepare('SELECT * FROM quiz_sessions WHERE id = ?').get(sessionId)
    return { session, items: itemDetails }
  })()

  res.status(201).json(result)
})

// ── POST /api/tasks/complete ──────────────────────────────────────
// 用户完成今日全部任务后调用：remaining_days -1，completed_days +1
// 防重：同一天只记一次
// Body: { student_id, wordbook_id }
router.post('/complete', (req, res) => {
  const { student_id, wordbook_id } = req.body
  if (!student_id || !wordbook_id) {
    res.status(400).json({ error: '缺少 student_id / wordbook_id' }); return
  }
  const sid = Number(student_id), wid = Number(wordbook_id)
  const today = todayInt()

  const plan = db.prepare(
    "SELECT * FROM study_plans WHERE student_id = ? AND wordbook_id = ? AND status = 'active'"
  ).get(sid, wid) as StudyPlanRow | undefined
  if (!plan) { res.status(404).json({ error: '未找到激活的学习计划' }); return }

  // 防止同天重复计入
  if (plan.last_completed_date === today) {
    res.json({ already_completed: true, plan }); return
  }

  // 验证今日任务确实已完成
  const { items } = buildTodayItems(sid, wid, plan)
  if (items.length > 0) {
    res.status(400).json({ error: '今日任务尚未全部完成' }); return
  }

  const now = Math.floor(Date.now() / 1000)
  const newRemainingDays = Math.max(0, plan.remaining_days - 1)

  db.prepare(`
    UPDATE study_plans
    SET remaining_days = ?, completed_days = completed_days + 1,
        last_completed_date = ?, updated_at = ?
    WHERE id = ?
  `).run(newRemainingDays, today, now, plan.id)

  const updated = db.prepare('SELECT * FROM study_plans WHERE id = ?').get(plan.id) as StudyPlanRow
  res.json({ already_completed: false, plan: updated })
})

// ── GET /api/tasks/forecast ───────────────────────────────────────
// 学习负载预测：过去14天实际 + 未来45天模拟
// ?student_id=&wordbook_id=&preview_remaining_days=&preview_daily_peak=&preview_target_level=
// 无激活计划时，若传入全部 preview_* 参数则进入纯预览模式（用于首次创建计划时展示预测图）
router.get('/forecast', (req, res) => {
  const { student_id, wordbook_id, preview_remaining_days, preview_daily_peak, preview_target_level } = req.query
  if (!student_id || !wordbook_id) {
    res.status(400).json({ error: '缺少 student_id / wordbook_id' }); return
  }
  const sid = Number(student_id), wid = Number(wordbook_id)

  const plan = db.prepare(
    "SELECT * FROM study_plans WHERE student_id = ? AND wordbook_id = ? AND status = 'active'"
  ).get(sid, wid) as StudyPlanRow | undefined

  // 无计划时：必须提供 preview 参数才能进入纯预览模式，否则 404
  if (!plan && !preview_remaining_days) {
    res.status(404).json({ error: '未找到激活的学习计划' }); return
  }

  // 允许预览模式（调整参数而不保存）
  const remainingDays = preview_remaining_days
    ? Math.max(1, Number(preview_remaining_days))
    : Math.max(1, plan!.remaining_days ?? 30)
  const dailyPeak = preview_daily_peak
    ? Math.max(1, Number(preview_daily_peak))
    : (plan!.daily_peak ?? 50)
  // 学习目标层级：预测模拟只计入目标层级以内的 quiz 类型
  const targetLevel = preview_target_level
    ? Math.min(3, Math.max(1, Number(preview_target_level)))
    : (plan?.target_level ?? 2)

  const today = todayInt()
  const HISTORY_DAYS = 14
  const FORECAST_DAYS = 45

  // ── 历史数据 ────────────────────────────────────────────────────
  const histStart = addDaysToInt(today, -(HISTORY_DAYS - 1))

  const histIntroRows = db.prepare(`
    SELECT sm.introduced_date AS date_int, COUNT(*) AS cnt
    FROM student_mastery sm
    JOIN wordbook_items wi ON wi.item_id = sm.item_id AND wi.wordbook_id = ?
    WHERE sm.student_id = ? AND sm.introduced_date >= ? AND sm.introduced_date <= ?
    GROUP BY sm.introduced_date
  `).all(wid, sid, histStart, today) as { date_int: number; cnt: number }[]

  // 历史复习量：当天有正确答案的 session 中答对词数（去重 item_id）
  const histReviewRows = db.prepare(`
    SELECT
      CAST(strftime('%Y%m%d', datetime(qa.answered_at, 'unixepoch')) AS INTEGER) AS date_int,
      COUNT(DISTINCT qa.item_id) AS cnt
    FROM quiz_answers qa
    JOIN quiz_sessions qs ON qs.id = qa.session_id
    WHERE qs.student_id = ? AND qs.wordbook_id = ?
      AND qa.is_correct = 1
      AND qa.answered_at >= CAST(strftime('%s', ?) AS INTEGER)
    GROUP BY date_int
  `).all(sid, wid, `${String(histStart).slice(0,4)}-${String(histStart).slice(4,6)}-${String(histStart).slice(6,8)}`) as { date_int: number; cnt: number }[]

  const introMap = new Map(histIntroRows.map(r => [r.date_int, r.cnt]))
  const reviewMap = new Map(histReviewRows.map(r => [r.date_int, r.cnt]))

  const history: ForecastDay[] = []
  for (let d = -(HISTORY_DAYS - 1); d <= 0; d++) {
    const dateInt = addDaysToInt(today, d)
    const newCnt = introMap.get(dateInt) ?? 0
    const reviewCnt = reviewMap.get(dateInt) ?? 0
    history.push({
      date: dateInt,
      new_count: newCnt,
      review_count: reviewCnt,
      total: newCnt + reviewCnt,
      is_over_peak: newCnt + reviewCnt > dailyPeak,
      is_future: false,
    })
  }

  // ── 未来预测模拟 ─────────────────────────────────────────────────
  const masteryRows = db.prepare(`
    SELECT sm.*, i.type AS item_type
    FROM student_mastery sm
    JOIN wordbook_items wi ON wi.item_id = sm.item_id AND wi.wordbook_id = ?
    JOIN items i ON i.id = sm.item_id
    WHERE sm.student_id = ? AND sm.introduced_date > 0
  `).all(wid, sid) as any[]

  const totalUnintroduced = (db.prepare(`
    SELECT COUNT(*) AS c FROM wordbook_items wi
    WHERE wi.wordbook_id = ?
      AND wi.item_id NOT IN (
        SELECT item_id FROM student_mastery WHERE student_id = ? AND introduced_date > 0
      )
  `).get(wid, sid) as { c: number }).c

  // 模拟状态（假设每天全部答对，error_weight=0）
  interface SimItem {
    en_to_zh_stage: number; en_to_zh_next: number
    zh_to_en_stage: number; zh_to_en_next: number
    spelling_stage: number; spelling_next: number
    item_type: string
  }
  const sim: SimItem[] = masteryRows.map(r => ({
    en_to_zh_stage: r.en_to_zh_stage, en_to_zh_next: r.en_to_zh_next,
    zh_to_en_stage: r.zh_to_en_stage, zh_to_en_next: r.zh_to_en_next,
    spelling_stage: r.spelling_stage, spelling_next: r.spelling_next,
    item_type: r.item_type,
  }))

  let simUnintroduced = totalUnintroduced
  let projectedCompletionDate: number | null = null

  const forecast: ForecastDay[] = []
  for (let d = 0; d < FORECAST_DAYS; d++) {
    const dayDate = addDaysToInt(today, d)

    // 统计到期复习词（仅统计 target_level 以内的 quiz 类型）
    const dueIndices: number[] = []
    for (let i = 0; i < sim.length; i++) {
      const qt = pickQuizType(sim[i], dayDate)
      if (qt === null) continue
      if (qt === 'zh_to_en' && targetLevel < 2) continue
      if (qt === 'spelling' && targetLevel < 3) continue
      dueIndices.push(i)
    }
    const isOverPeak = dueIndices.length > dailyPeak
    const reviewCount = Math.min(dueIndices.length, dailyPeak)

    // 新词配额
    const effRem = Math.max(1, remainingDays - d)  // 模拟remaining_days随完成递减
    const dailyNewQuota = Math.ceil(simUnintroduced / effRem)
    const newSlots = Math.max(0, dailyPeak - reviewCount)
    const newCount = Math.min(dailyNewQuota, newSlots, simUnintroduced)

    forecast.push({ date: dayDate, review_count: reviewCount, new_count: newCount, total: reviewCount + newCount, is_over_peak: isOverPeak, is_future: true })

    if (newCount > 0 && simUnintroduced <= newCount && projectedCompletionDate === null) {
      projectedCompletionDate = dayDate
    }

    // 推进模拟状态
    let done = 0
    for (const idx of dueIndices) {
      if (done >= dailyPeak) break
      const m = sim[idx]
      const qt = pickQuizType(m, dayDate)
      if (!qt) continue
      done++
      if (qt === 'en_to_zh') {
        m.en_to_zh_stage = Math.min(5, m.en_to_zh_stage + 1)
        m.en_to_zh_next = nextReviewDate(m.en_to_zh_stage, dayDate)
        if (targetLevel >= 2 && m.en_to_zh_stage >= 2 && m.zh_to_en_stage === 0) {
          m.zh_to_en_stage = 1; m.zh_to_en_next = nextReviewDate(1, dayDate)
        }
      } else if (qt === 'zh_to_en') {
        m.zh_to_en_stage = Math.min(5, m.zh_to_en_stage + 1)
        m.zh_to_en_next = nextReviewDate(m.zh_to_en_stage, dayDate)
        if (targetLevel >= 3 && m.zh_to_en_stage >= 2 && m.spelling_stage === 0 && m.item_type === 'word') {
          m.spelling_stage = 1; m.spelling_next = nextReviewDate(1, dayDate)
        }
      } else if (qt === 'spelling') {
        m.spelling_stage = Math.min(5, m.spelling_stage + 1)
        m.spelling_next = nextReviewDate(m.spelling_stage, dayDate)
      }
    }
    // 模拟新词引入
    for (let n = 0; n < newCount; n++) {
      sim.push({
        en_to_zh_stage: 1, en_to_zh_next: nextReviewDate(1, dayDate),
        zh_to_en_stage: 0, zh_to_en_next: 0,
        spelling_stage: 0, spelling_next: 0,
        item_type: 'word',
      })
    }
    simUnintroduced = Math.max(0, simUnintroduced - newCount)
  }

  // 剩余词超量提示
  const overloadWarning = plan && plan.remaining_days === 0 && totalUnintroduced > 0
    ? { remaining_words: totalUnintroduced, suggested_extra_days: Math.ceil(totalUnintroduced / Math.max(1, dailyPeak)) }
    : null

  res.json({
    history,
    forecast,
    total_unintroduced: totalUnintroduced,
    remaining_days: remainingDays,
    daily_peak: dailyPeak,
    projected_completion_date: projectedCompletionDate,
    overload_warning: overloadWarning,
  })
})

// ── GET /api/tasks/stats ──────────────────────────────────────────
router.get('/stats', (req, res) => {
  const { student_id, wordbook_id } = req.query
  if (!student_id || !wordbook_id) {
    res.status(400).json({ error: '缺少 student_id / wordbook_id' }); return
  }
  const sid = Number(student_id), wid = Number(wordbook_id)
  const today = todayInt()

  const totalItems = (db.prepare(
    'SELECT COUNT(*) AS c FROM wordbook_items WHERE wordbook_id=?'
  ).get(wid) as { c: number }).c

  const introduced = (db.prepare(`
    SELECT COUNT(*) AS c FROM student_mastery sm
    JOIN wordbook_items wi ON wi.item_id = sm.item_id
    WHERE sm.student_id=? AND wi.wordbook_id=? AND sm.introduced_date > 0
  `).get(sid, wid) as { c: number }).c

  const todayNew = (db.prepare(`
    SELECT COUNT(*) AS c FROM student_mastery sm
    JOIN wordbook_items wi ON wi.item_id = sm.item_id
    WHERE sm.student_id=? AND wi.wordbook_id=? AND sm.introduced_date=?
  `).get(sid, wid, today) as { c: number }).c

  const zhToEnActive = (db.prepare(`
    SELECT COUNT(*) AS c FROM student_mastery sm
    JOIN wordbook_items wi ON wi.item_id = sm.item_id
    WHERE sm.student_id=? AND wi.wordbook_id=? AND sm.zh_to_en_stage > 0
  `).get(sid, wid) as { c: number }).c

  const spellingActive = (db.prepare(`
    SELECT COUNT(*) AS c FROM student_mastery sm
    JOIN wordbook_items wi ON wi.item_id = sm.item_id
    WHERE sm.student_id=? AND wi.wordbook_id=? AND sm.spelling_stage > 0
  `).get(sid, wid) as { c: number }).c

  const todayReviewedSessions = (db.prepare(`
    SELECT COUNT(DISTINCT qa.item_id) AS c
    FROM quiz_answers qa
    JOIN quiz_sessions qs ON qs.id = qa.session_id
    WHERE qs.student_id=? AND qs.wordbook_id=? AND qa.is_correct=1
      AND qa.answered_at >= CAST(strftime('%s', date('now')) AS INTEGER)
  `).get(sid, wid) as { c: number }).c

  res.json({
    total_items: totalItems,
    introduced,
    today_new: todayNew,
    zh_to_en_active: zhToEnActive,
    spelling_active: spellingActive,
    today_correct: todayReviewedSessions,
  })
})

export default router
