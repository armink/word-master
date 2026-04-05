import { Router } from 'express'
import db from '../db/client'
import type { QuizSessionRow, QuizAnswerRow } from '../types/index'
import { nextReviewDate, todayInt } from './tasks'

const router = Router()

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// POST /api/quiz/sessions
// Body: { student_id, wordbook_id, quiz_type }
router.post('/sessions', (req, res) => {
  const { student_id, wordbook_id, quiz_type } = req.body

  if (!student_id || !wordbook_id || !quiz_type) {
    res.status(400).json({ error: '缺少必要参数 student_id / wordbook_id / quiz_type' })
    return
  }
  const validTypes = ['en_to_zh', 'zh_to_en', 'spelling']
  if (!validTypes.includes(quiz_type)) {
    res.status(400).json({ error: 'quiz_type 无效，可选值：en_to_zh / zh_to_en / spelling' })
    return
  }

  const student = db.prepare('SELECT id FROM students WHERE id = ?').get(student_id)
  if (!student) { res.status(404).json({ error: '学生不存在' }); return }

  const wordbook = db.prepare('SELECT id FROM wordbooks WHERE id = ?').get(wordbook_id)
  if (!wordbook) { res.status(404).json({ error: '单词本不存在' }); return }

  // 拼写测验只针对单词（非短语）
  const items = quiz_type === 'spelling'
    ? db.prepare(`
        SELECT i.*, wi.sort_order
        FROM items i
        JOIN wordbook_items wi ON wi.item_id = i.id
        WHERE wi.wordbook_id = ? AND i.type = 'word'
        ORDER BY wi.sort_order ASC, i.id ASC
      `).all(wordbook_id)
    : db.prepare(`
        SELECT i.*, wi.sort_order
        FROM items i
        JOIN wordbook_items wi ON wi.item_id = i.id
        WHERE wi.wordbook_id = ?
        ORDER BY wi.sort_order ASC, i.id ASC
      `).all(wordbook_id)

  if ((items as unknown[]).length === 0) {
    res.status(400).json({ error: '单词本中没有可测验的词条' })
    return
  }

  const result = db.prepare(`
    INSERT INTO quiz_sessions (student_id, wordbook_id, quiz_type, total_words)
    VALUES (?, ?, ?, ?)
  `).run(student_id, wordbook_id, quiz_type, (items as unknown[]).length)

  const session = db.prepare('SELECT * FROM quiz_sessions WHERE id = ?').get(result.lastInsertRowid) as QuizSessionRow
  res.status(201).json({ ...session, items })
})

// GET /api/quiz/sessions/:id
router.get('/sessions/:id', (req, res) => {
  const session = db.prepare('SELECT * FROM quiz_sessions WHERE id = ?').get(req.params.id) as QuizSessionRow | undefined
  if (!session) { res.status(404).json({ error: '会话不存在' }); return }

  // 计划模式：优先使用 session_items（含 per-item quiz_type 和排序）
  let sessionItems = db.prepare(`
    SELECT i.*, si.quiz_type AS item_quiz_type, si.sort_order
    FROM session_items si
    JOIN items i ON i.id = si.item_id
    WHERE si.session_id = ?
    ORDER BY si.sort_order ASC
  `).all(req.params.id) as any[]

  if (sessionItems.length > 0) {
    // in_progress session：过滤已答对的词，使 queue 与 total_words 一致
    if (session.status === 'in_progress') {
      const correctIds = new Set(
        (db.prepare(
          'SELECT DISTINCT item_id FROM quiz_answers WHERE session_id = ? AND is_correct = 1'
        ).all(req.params.id) as { item_id: number }[]).map(r => r.item_id)
      )
      if (correctIds.size > 0) {
        sessionItems = sessionItems.filter(item => !correctIds.has(item.id))
      }
      sessionItems = shuffle(sessionItems)
    }
    res.json({ ...session, items: sessionItems })
    return
  }

  // 兼容旧模式：从单词本取词
  const items = session.quiz_type === 'spelling'
    ? db.prepare(`
        SELECT i.*, wi.sort_order
        FROM items i
        JOIN wordbook_items wi ON wi.item_id = i.id
        WHERE wi.wordbook_id = ? AND i.type = 'word'
        ORDER BY wi.sort_order ASC, i.id ASC
      `).all(session.wordbook_id)
    : db.prepare(`
        SELECT i.*, wi.sort_order
        FROM items i
        JOIN wordbook_items wi ON wi.item_id = i.id
        WHERE wi.wordbook_id = ?
        ORDER BY wi.sort_order ASC, i.id ASC
      `).all(session.wordbook_id)

  res.json({ ...session, items: session.status === 'in_progress' ? shuffle(items as any[]) : items })
})

// POST /api/quiz/sessions/:id/answers
// Body: { item_id, user_answer, is_correct, duration_ms? }
router.post('/sessions/:id/answers', (req, res) => {
  const session = db.prepare('SELECT * FROM quiz_sessions WHERE id = ?').get(req.params.id) as QuizSessionRow | undefined
  if (!session) { res.status(404).json({ error: '会话不存在' }); return }
  if (session.status !== 'in_progress') {
    res.status(400).json({ error: '会话已结束，无法继续作答' })
    return
  }

  const { item_id, user_answer, is_correct, duration_ms } = req.body
  if (item_id === undefined || user_answer === undefined || is_correct === undefined) {
    res.status(400).json({ error: '缺少必要参数 item_id / user_answer / is_correct' })
    return
  }

  // 自动计算这道题是第几次作答
  const prevAttempt = db.prepare(
    'SELECT MAX(attempt) AS max_attempt FROM quiz_answers WHERE session_id = ? AND item_id = ?'
  ).get(req.params.id, item_id) as { max_attempt: number | null }
  const attempt = (prevAttempt.max_attempt ?? 0) + 1

  const insertResult = db.prepare(`
    INSERT INTO quiz_answers (session_id, item_id, attempt, user_answer, is_correct, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    req.params.id,
    item_id,
    attempt,
    String(user_answer),
    is_correct ? 1 : 0,
    duration_ms ?? 0
  )

  const answer = db.prepare('SELECT * FROM quiz_answers WHERE id = ?').get(insertResult.lastInsertRowid) as QuizAnswerRow
  res.status(201).json(answer)
})

// POST /api/quiz/sessions/:id/finish
// 计算最终正确率、更新掌握度、关闭会话
router.post('/sessions/:id/finish', (req, res) => {
  const session = db.prepare('SELECT * FROM quiz_sessions WHERE id = ?').get(req.params.id) as QuizSessionRow | undefined
  if (!session) { res.status(404).json({ error: '会话不存在' }); return }
  if (session.status !== 'in_progress') {
    res.status(400).json({ error: '会话已结束' })
    return
  }

  // ── 首次正确率计算 ────────────────────────────────────────────────
  // 分母：session_items 数量（计划模式，不受中途退出时 total_words 被缩减的影响）
  //       或 session.total_words（传统单词本模式，创建后不会变化）
  // 分子：attempt = 1 且答对的词条数（首次即答对）
  // 注意：掌握度更新仍使用"最后一次作答"（见下方 lastAttempts），两者独立
  const siCount = (db.prepare(
    'SELECT COUNT(*) AS c FROM session_items WHERE session_id = ?'
  ).get(req.params.id) as { c: number }).c
  const total = siCount > 0 ? siCount : (session.total_words ?? 0)

  const firstAttemptStats = db.prepare(`
    SELECT COALESCE(SUM(is_correct), 0) AS correct_count
    FROM quiz_answers
    WHERE session_id = ? AND attempt = 1
  `).get(req.params.id) as { correct_count: number }

  const correct_count = Number(firstAttemptStats.correct_count)
  const final_accuracy = total > 0 ? Math.round((correct_count / total) * 100) / 100 : 0
  const passed = final_accuracy >= session.pass_accuracy
  const now = Math.floor(Date.now() / 1000)
  const duration_seconds = now - session.started_at

  db.prepare(`
    UPDATE quiz_sessions
    SET status = ?, final_accuracy = ?, duration_seconds = ?, finished_at = ?
    WHERE id = ?
  `).run(passed ? 'passed' : 'abandoned', final_accuracy, duration_seconds, now, req.params.id)

  // 取每个词条最后一次作答结果，更新掌握度
  const lastAttempts = db.prepare(`
    SELECT item_id, is_correct
    FROM quiz_answers qa
    WHERE session_id = ?
      AND attempt = (
        SELECT MAX(attempt) FROM quiz_answers
        WHERE session_id = qa.session_id AND item_id = qa.item_id
      )
  `).all(req.params.id) as { item_id: number; is_correct: 0 | 1 }[]

  // 计划模式：per-item quiz_type 映射
  const itemQtMap = new Map(
    (db.prepare('SELECT item_id, quiz_type FROM session_items WHERE session_id = ?')
      .all(req.params.id) as { item_id: number; quiz_type: string }[])
      .map(r => [r.item_id, r.quiz_type])
  )
  const isPlanMode = itemQtMap.size > 0
  const today = todayInt()

  db.transaction(() => {
    for (const { item_id, is_correct } of lastAttempts) {
      const item = db.prepare('SELECT type FROM items WHERE id = ?').get(item_id) as { type: string }
      const delta = is_correct ? 10 : -5

      // 确保掌握度行存在
      db.prepare(`
        INSERT OR IGNORE INTO student_mastery (student_id, item_id, spelling_level)
        VALUES (?, ?, ?)
      `).run(session.student_id, item_id, item.type === 'phrase' ? null : 0)

      // ── 计划模式：首先读取当前 stage，对"全新词答错"直接跳过全部 mastery 更新 ──────
      // 新词（stage=0）答错 → 不写 introduced_date，保持未引入状态，下次仍作为新词出现
      // 这样 todayIntroduced 只计答对的新词，dailyNewRemaining 才正确扣减
      if (isPlanMode && !is_correct) {
        const qt = itemQtMap.get(item_id) ?? session.quiz_type
        type StageRow = { en_to_zh_stage: number; zh_to_en_stage: number; spelling_stage: number }
        const sm = db.prepare(
          'SELECT en_to_zh_stage, zh_to_en_stage, spelling_stage FROM student_mastery WHERE student_id=? AND item_id=?'
        ).get(session.student_id, item_id) as StageRow | undefined
        const currentStage = qt === 'en_to_zh' ? sm?.en_to_zh_stage
          : qt === 'zh_to_en' ? sm?.zh_to_en_stage
          : sm?.spelling_stage
        if ((currentStage ?? 0) === 0) continue  // 全新词答错，跳过，保持未引入
      }

      if (session.quiz_type === 'en_to_zh') {
        db.prepare(`
          UPDATE student_mastery
          SET en_to_zh_level = MAX(0, MIN(100, en_to_zh_level + ?)),
              last_reviewed_at = ?, updated_at = ?
          WHERE student_id = ? AND item_id = ?
        `).run(delta, now, now, session.student_id, item_id)
      } else if (session.quiz_type === 'zh_to_en') {
        db.prepare(`
          UPDATE student_mastery
          SET zh_to_en_level = MAX(0, MIN(100, zh_to_en_level + ?)),
              last_reviewed_at = ?, updated_at = ?
          WHERE student_id = ? AND item_id = ?
        `).run(delta, now, now, session.student_id, item_id)
      } else if (session.quiz_type === 'spelling' && item.type === 'word') {
        db.prepare(`
          UPDATE student_mastery
          SET spelling_level = MAX(0, MIN(100, COALESCE(spelling_level, 0) + ?)),
              last_reviewed_at = ?, updated_at = ?
          WHERE student_id = ? AND item_id = ?
        `).run(delta, now, now, session.student_id, item_id)
      }

      // ── 计划模式：更新艾宾浩斯 stage / next ───────────────────────
      if (isPlanMode) {
        const qt = itemQtMap.get(item_id) ?? session.quiz_type
        type MasteryStages = { en_to_zh_stage: number; zh_to_en_stage: number; spelling_stage: number }
        const m = db.prepare(
          'SELECT en_to_zh_stage, zh_to_en_stage, spelling_stage FROM student_mastery WHERE student_id=? AND item_id=?'
        ).get(session.student_id, item_id) as MasteryStages | undefined

        if (m) {
          if (qt === 'en_to_zh') {
            // 到这里 is_correct=true 或 stage>0（已引入词答错）
            const newStage = is_correct
              ? Math.min(5, m.en_to_zh_stage + 1)
              : Math.max(1, m.en_to_zh_stage)
            const nextDate = is_correct ? nextReviewDate(newStage) : today
            db.prepare(`
              UPDATE student_mastery
              SET introduced_date = CASE WHEN introduced_date = 0 THEN ? ELSE introduced_date END,
                  en_to_zh_stage = ?, en_to_zh_next = ?, last_reviewed_at = ?, updated_at = ?
              WHERE student_id = ? AND item_id = ?
            `).run(today, newStage, nextDate, now, now, session.student_id, item_id)
            // 解锁 zh_to_en（en_to_zh_stage 首次达到 2）→ 明天开始，不占今日计数
            if (newStage >= 2 && m.zh_to_en_stage === 0) {
              db.prepare(
                'UPDATE student_mastery SET zh_to_en_stage=1, zh_to_en_next=?, updated_at=? WHERE student_id=? AND item_id=?'
              ).run(nextReviewDate(1), now, session.student_id, item_id)
            }
          } else if (qt === 'zh_to_en') {
            const newStage = is_correct ? Math.min(5, m.zh_to_en_stage + 1) : m.zh_to_en_stage
            const nextDate = is_correct ? nextReviewDate(newStage) : today
            db.prepare(
              'UPDATE student_mastery SET zh_to_en_stage=?, zh_to_en_next=?, last_reviewed_at=?, updated_at=? WHERE student_id=? AND item_id=?'
            ).run(newStage, nextDate, now, now, session.student_id, item_id)
            // 解锁 spelling（zh_to_en_stage 首次达到 2，仅单词）→ 明天开始
            if (newStage >= 2 && m.spelling_stage === 0 && item.type === 'word') {
              db.prepare(
                'UPDATE student_mastery SET spelling_stage=1, spelling_next=?, updated_at=? WHERE student_id=? AND item_id=?'
              ).run(nextReviewDate(1), now, session.student_id, item_id)
            }
          } else if (qt === 'spelling' && item.type === 'word') {
            const newStage = is_correct ? Math.min(5, m.spelling_stage + 1) : m.spelling_stage
            const nextDate = is_correct ? nextReviewDate(newStage) : today
            db.prepare(
              'UPDATE student_mastery SET spelling_stage=?, spelling_next=?, last_reviewed_at=?, updated_at=? WHERE student_id=? AND item_id=?'
            ).run(newStage, nextDate, now, now, session.student_id, item_id)
          }
        }
      }
    }
  })()

  const updatedSession = db.prepare('SELECT * FROM quiz_sessions WHERE id = ?').get(req.params.id) as QuizSessionRow
  res.json({
    session_id: session.id,
    quiz_type: session.quiz_type,
    total_words: total,
    correct_count,
    final_accuracy,
    duration_seconds,
    passed,
    session: updatedSession,
  })
})

export default router
