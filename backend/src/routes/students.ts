import { Router } from 'express'
import db from '../db/client'
import type { StudentRow } from '../types/index'

const router = Router()

// GET /api/students
router.get('/', (_req, res) => {
  const students = db.prepare('SELECT * FROM students ORDER BY created_at ASC').all() as StudentRow[]
  res.json(students)
})

// POST /api/students
router.post('/', (req, res) => {
  const { name } = req.body
  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ error: '名字不能为空' })
    return
  }
  const result = db.prepare('INSERT INTO students (name) VALUES (?)').run(name.trim())
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(result.lastInsertRowid) as StudentRow
  res.status(201).json(student)
})

export default router
