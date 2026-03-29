import { Router } from 'express'
import db from '../db/client'
import type { StudyPlanRow } from '../types/index'

const router = Router()

// 今天的 YYYYMMDD 整数
function today(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

// GET /api/plans?student_id=&wordbook_id=
router.get('/', (req, res) => {
  const { student_id, wordbook_id } = req.query
  if (!student_id || !wordbook_id) {
    res.status(400).json({ error: '缺少 student_id / wordbook_id' })
    return
  }
  const plan = db.prepare(
    'SELECT * FROM study_plans WHERE student_id = ? AND wordbook_id = ?'
  ).get(Number(student_id), Number(wordbook_id)) as StudyPlanRow | undefined

  if (!plan) { res.status(404).json({ error: '计划不存在' }); return }
  res.json(plan)
})

// POST /api/plans  —  创建或替换（upsert）
// Body: { student_id, wordbook_id, daily_new }
router.post('/', (req, res) => {
  const { student_id, wordbook_id, daily_new } = req.body
  if (!student_id || !wordbook_id || !daily_new) {
    res.status(400).json({ error: '缺少 student_id / wordbook_id / daily_new' })
    return
  }
  if (!Number.isInteger(daily_new) || daily_new < 1 || daily_new > 100) {
    res.status(400).json({ error: 'daily_new 必须在 1-100 之间' })
    return
  }

  const student = db.prepare('SELECT id FROM students WHERE id = ?').get(Number(student_id))
  if (!student) { res.status(404).json({ error: '学生不存在' }); return }

  const wordbook = db.prepare('SELECT id FROM wordbooks WHERE id = ?').get(Number(wordbook_id))
  if (!wordbook) { res.status(404).json({ error: '单词本不存在' }); return }

  const now = Math.floor(Date.now() / 1000)
  const t = today()

  // upsert：同一学生同一单词本只有一个计划
  db.prepare(`
    INSERT INTO study_plans (student_id, wordbook_id, daily_new, start_date, status, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?)
    ON CONFLICT(student_id, wordbook_id)
    DO UPDATE SET daily_new=excluded.daily_new, status='active',
                  start_date=CASE WHEN status='active' THEN start_date ELSE excluded.start_date END,
                  updated_at=excluded.updated_at
  `).run(Number(student_id), Number(wordbook_id), Number(daily_new), t, now)

  const plan = db.prepare(
    'SELECT * FROM study_plans WHERE student_id = ? AND wordbook_id = ?'
  ).get(Number(student_id), Number(wordbook_id)) as StudyPlanRow

  res.status(201).json(plan)
})

// PATCH /api/plans/:id  —  修改 daily_new 或 status
router.patch('/:id', (req, res) => {
  const plan = db.prepare('SELECT * FROM study_plans WHERE id = ?').get(req.params.id) as StudyPlanRow | undefined
  if (!plan) { res.status(404).json({ error: '计划不存在' }); return }

  const { daily_new, status } = req.body
  const now = Math.floor(Date.now() / 1000)

  if (daily_new !== undefined) {
    if (!Number.isInteger(daily_new) || daily_new < 1 || daily_new > 100) {
      res.status(400).json({ error: 'daily_new 必须在 1-100 之间' }); return
    }
    db.prepare('UPDATE study_plans SET daily_new=?, updated_at=? WHERE id=?').run(Number(daily_new), now, plan.id)
  }
  if (status !== undefined) {
    const valid = ['active', 'paused', 'completed']
    if (!valid.includes(status)) { res.status(400).json({ error: 'status 无效' }); return }
    db.prepare('UPDATE study_plans SET status=?, updated_at=? WHERE id=?').run(status, now, plan.id)
  }

  const updated = db.prepare('SELECT * FROM study_plans WHERE id = ?').get(plan.id) as StudyPlanRow
  res.json(updated)
})

export default router
