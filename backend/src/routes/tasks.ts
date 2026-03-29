/**
 * 今日任务 API
 *
 * GET  /api/tasks/today?student_id=&wordbook_id=   — 计算今日任务概览
 * POST /api/tasks/start                            — 创建今日 session（含 per-item quiz_type）
 * POST /api/tasks/extra                            — 继续学习：追加 N 个新词并创建 session
 */
import { Router } from 'express'
import db from '../db/client'
import type { StudyPlanRow, TodayTask, TodayTaskItem, QuizType, QuizSessionRow } from '../types/index'

const router = Router()

/** 今天的 YYYYMMDD 整数 */
export function todayInt(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

/**
 * 艾宾浩斯间隔（天）：答对后按当前 stage 决定下次复习时间
 * stage 1→2: +1d, 2→3: +3d, 3→4: +7d, 4→5: +14d, 5 max: +30d
 */
const EBBINGHAUS_INTERVALS = [0, 1, 3, 7, 14, 30]

/** stage 答对后的下次复习日期 (YYYYMMDD) */
export function nextReviewDate(stage: number, base: number = todayInt()): number {
  const days = stage >= 5 ? 30 : EBBINGHAUS_INTERVALS[Math.min(stage, 5)]
  const d = new Date(`${String(base).slice(0,4)}-${String(base).slice(4,6)}-${String(base).slice(6,8)}`)
  d.setDate(d.getDate() + days)
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

/** 根据当前 mastery 决定本次该考哪个阶段（最高已解锁且到期的阶段） */
function pickQuizType(m: {
  en_to_zh_stage: number, en_to_zh_next: number,
  zh_to_en_stage: number, zh_to_en_next: number,
  spelling_stage: number, spelling_next: number,
  item_type: string,
}, today: number): QuizType | null {
  // 拼写（仅单词，stage > 0 且到期）
  if (m.item_type === 'word' && m.spelling_stage > 0 && m.spelling_next <= today) return 'spelling'
  if (m.zh_to_en_stage > 0 && m.zh_to_en_next <= today) return 'zh_to_en'
  if (m.en_to_zh_stage > 0 && m.en_to_zh_next <= today) return 'en_to_zh'
  return null
}

/** 构建今日可测词列表（不含 session 创建） */
function buildTodayItems(studentId: number, wordbookId: number, plan: StudyPlanRow): TodayTaskItem[] {
  const today = todayInt()

  // ── 1. 到期复习词 ───────────────────────────────────────────────
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
    ORDER BY wi.sort_order ASC, i.id ASC
  `).all(wordbookId, studentId, today, today, today) as any[]

  const reviewItems: TodayTaskItem[] = reviewRows
    .map(row => {
      const qt = pickQuizType(row, today)
      return qt ? { item_id: row.item_id, quiz_type: qt, is_new: false } : null
    })
    .filter(Boolean) as TodayTaskItem[]

  // ── 2. 今日新词 ─────────────────────────────────────────────────
  const newRows = db.prepare(`
    SELECT i.id AS item_id
    FROM wordbook_items wi
    JOIN items i ON i.id = wi.item_id
    WHERE wi.wordbook_id = ?
      AND i.id NOT IN (
        SELECT item_id FROM student_mastery
        WHERE student_id = ? AND introduced_date > 0
      )
    ORDER BY wi.sort_order ASC, i.id ASC
    LIMIT ?
  `).all(wordbookId, studentId, plan.daily_new) as { item_id: number }[]

  const newItems: TodayTaskItem[] = newRows.map(r => ({
    item_id: r.item_id,
    quiz_type: 'en_to_zh' as QuizType,
    is_new: true,
  }))

  return [...reviewItems, ...newItems]
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

  const items = buildTodayItems(sid, wid, plan)
  const reviewCount = items.filter(i => !i.is_new).length
  const newCount = items.filter(i => i.is_new).length

  // 剩余未引入词数
  const remaining = (db.prepare(`
    SELECT COUNT(*) AS c FROM wordbook_items wi
    WHERE wi.wordbook_id = ?
      AND wi.item_id NOT IN (
        SELECT item_id FROM student_mastery WHERE student_id = ? AND introduced_date > 0
      )
  `).get(wid, sid) as { c: number }).c - newCount

  const result: TodayTask = {
    plan,
    review_count: reviewCount,
    new_count: newCount,
    remaining_new: Math.max(0, remaining),
    items,
  }
  res.json(result)
})

// ── POST /api/tasks/start ─────────────────────────────────────────
// Body: { student_id, wordbook_id }
// 取今日任务队列，创建 quiz_session + session_items，返回 session + items
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

  // 已有进行中 session → 直接返回，防止重复创建导致词数翻倍
  // 但若计划在 session 创建之后被修改（updated_at > started_at），则废弃旧 session 并重建
  const existingSession = db.prepare(`
    SELECT * FROM quiz_sessions
    WHERE student_id = ? AND wordbook_id = ? AND status = 'in_progress'
    ORDER BY started_at DESC LIMIT 1
  `).get(sid, wid) as QuizSessionRow | undefined
  if (existingSession) {
    if (existingSession.started_at >= plan.updated_at) {
      // 计划未变更，直接复用旧 session
      const items = db.prepare(`
        SELECT i.*, si.quiz_type AS item_quiz_type, si.sort_order
        FROM session_items si
        JOIN items i ON i.id = si.item_id
        WHERE si.session_id = ?
        ORDER BY si.sort_order ASC
      `).all(existingSession.id)
      res.json({ session: existingSession, items })
      return
    }
    // 计划已更新，废弃旧 session
    db.prepare(`UPDATE quiz_sessions SET status = 'abandoned' WHERE id = ?`).run(existingSession.id)
  }

  const taskItems = buildTodayItems(sid, wid, plan)
  if (taskItems.length === 0) {
    res.status(400).json({ error: '今日没有待学习/复习的词条' }); return
  }

  const result = db.transaction(() => {
    // 创建 session（quiz_type 设为 en_to_zh 作为默认，实际由 session_items 决定）
    const sessionRes = db.prepare(`
      INSERT INTO quiz_sessions (student_id, wordbook_id, quiz_type, total_words)
      VALUES (?, ?, 'en_to_zh', ?)
    `).run(sid, wid, taskItems.length)
    const sessionId = sessionRes.lastInsertRowid

    // 写入 session_items（mastery 不在此初始化，在 finish 时按答题结果写入）
    const insertItem = db.prepare(
      'INSERT INTO session_items (session_id, item_id, quiz_type, sort_order) VALUES (?, ?, ?, ?)'
    )
    taskItems.forEach((item, idx) => {
      insertItem.run(sessionId, item.item_id, item.quiz_type, idx)
    })

    // 取 items 详情
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
// 今日已完成，继续追加 N 个新词
// Body: { student_id, wordbook_id, extra_count }
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

export default router
