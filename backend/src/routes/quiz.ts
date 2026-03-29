import { Router } from 'express'
import db from '../db/client'
import type { QuizSessionRow, QuizAnswerRow } from '../types/index'

const router = Router()

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

  const items = db.prepare(`
    SELECT i.*, wi.sort_order
    FROM items i
    JOIN wordbook_items wi ON wi.item_id = i.id
    WHERE wi.wordbook_id = ?
    ORDER BY wi.sort_order ASC, i.id ASC
  `).all(session.wordbook_id)

  res.json({ ...session, items })
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

  // 取每个词条最后一次作答，统计正确率
  const stats = db.prepare(`
    SELECT
      COUNT(*)        AS total,
      SUM(is_correct) AS correct_count
    FROM quiz_answers qa
    WHERE session_id = ?
      AND attempt = (
        SELECT MAX(attempt) FROM quiz_answers
        WHERE session_id = qa.session_id AND item_id = qa.item_id
      )
  `).get(req.params.id) as { total: number; correct_count: number }

  const total = stats.total ?? 0
  const correct_count = Number(stats.correct_count ?? 0)
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

  db.transaction(() => {
    for (const { item_id, is_correct } of lastAttempts) {
      const item = db.prepare('SELECT type FROM items WHERE id = ?').get(item_id) as { type: string }
      const delta = is_correct ? 10 : -5

      // 确保掌握度行存在
      db.prepare(`
        INSERT OR IGNORE INTO student_mastery (student_id, item_id, spelling_level)
        VALUES (?, ?, ?)
      `).run(session.student_id, item_id, item.type === 'phrase' ? null : 0)

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
