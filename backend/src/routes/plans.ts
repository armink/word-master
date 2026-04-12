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
// Body: { student_id, wordbook_id, remaining_days, daily_peak?, target_level? }
router.post('/', (req, res) => {
  const { student_id, wordbook_id, remaining_days, daily_peak = 50, target_level = 2 } = req.body
  if (!student_id || !wordbook_id || remaining_days === undefined) {
    res.status(400).json({ error: '缺少 student_id / wordbook_id / remaining_days' })
    return
  }
  if (!Number.isInteger(remaining_days) || remaining_days < 1 || remaining_days > 3650) {
    res.status(400).json({ error: 'remaining_days 必须在 1-3650 之间' })
    return
  }
  if (!Number.isInteger(daily_peak) || daily_peak < 1 || daily_peak > 200) {
    res.status(400).json({ error: 'daily_peak 必须在 1-200 之间' })
    return
  }
  if (![1, 2, 3].includes(Number(target_level))) {
    res.status(400).json({ error: 'target_level 必须为 1、2 或 3' })
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
    INSERT INTO study_plans (student_id, wordbook_id, daily_new, remaining_days, daily_peak, target_level, start_date, status, updated_at)
    VALUES (?, ?, 10, ?, ?, ?, ?, 'active', ?)
    ON CONFLICT(student_id, wordbook_id)
    DO UPDATE SET remaining_days=excluded.remaining_days,
                  daily_peak=excluded.daily_peak,
                  target_level=excluded.target_level,
                  status='active',
                  start_date=CASE WHEN status='active' THEN start_date ELSE excluded.start_date END,
                  updated_at=excluded.updated_at
  `).run(Number(student_id), Number(wordbook_id), Number(remaining_days), Number(daily_peak), Number(target_level), t, now)

  const plan = db.prepare(
    'SELECT * FROM study_plans WHERE student_id = ? AND wordbook_id = ?'
  ).get(Number(student_id), Number(wordbook_id)) as StudyPlanRow

  res.status(201).json(plan)
})

// PATCH /api/plans/:id  —  修改 remaining_days / daily_peak / status
router.patch('/:id', (req, res) => {
  const plan = db.prepare('SELECT * FROM study_plans WHERE id = ?').get(req.params.id) as StudyPlanRow | undefined
  if (!plan) { res.status(404).json({ error: '计划不存在' }); return }

  const { remaining_days, daily_peak, status } = req.body
  const now = Math.floor(Date.now() / 1000)

  if (remaining_days !== undefined) {
    if (!Number.isInteger(remaining_days) || remaining_days < 1 || remaining_days > 3650) {
      res.status(400).json({ error: 'remaining_days 必须在 1-3650 之间' }); return
    }
    db.prepare('UPDATE study_plans SET remaining_days=?, updated_at=? WHERE id=?').run(Number(remaining_days), now, plan.id)
  }
  if (daily_peak !== undefined) {
    if (!Number.isInteger(daily_peak) || daily_peak < 1 || daily_peak > 200) {
      res.status(400).json({ error: 'daily_peak 必须在 1-200 之间' }); return
    }
    db.prepare('UPDATE study_plans SET daily_peak=?, updated_at=? WHERE id=?').run(Number(daily_peak), now, plan.id)
  }
  if (status !== undefined) {
    const valid = ['active', 'paused', 'completed']
    if (!valid.includes(status)) { res.status(400).json({ error: 'status 无效' }); return }
    db.prepare('UPDATE study_plans SET status=?, updated_at=? WHERE id=?').run(status, now, plan.id)
  }
  const { target_level } = req.body
  if (target_level !== undefined) {
    if (![1, 2, 3].includes(Number(target_level))) {
      res.status(400).json({ error: 'target_level 必须为 1、2 或 3' }); return
    }
    db.prepare('UPDATE study_plans SET target_level=?, updated_at=? WHERE id=?').run(Number(target_level), now, plan.id)
  }

  const updated = db.prepare('SELECT * FROM study_plans WHERE id = ?').get(plan.id) as StudyPlanRow
  res.json(updated)
})

export default router
