import { Router } from 'express'
import db from '../db/client'

const router = Router()

// GET /api/records?student_id=X&wordbook_id=Y
// 返回词条列表，附带该学生的掌握度
router.get('/', (req, res) => {
  const { student_id, wordbook_id } = req.query

  if (!student_id) {
    res.status(400).json({ error: '缺少 student_id 参数' })
    return
  }

  let items: unknown[]

  if (wordbook_id) {
    items = db.prepare(`
      SELECT i.*,
             wi.sort_order,
             COALESCE(sm.en_to_zh_level, 0) AS en_to_zh_level,
             COALESCE(sm.zh_to_en_level, 0) AS zh_to_en_level,
             sm.spelling_level,
             sm.last_reviewed_at
      FROM items i
      JOIN wordbook_items wi ON wi.item_id = i.id
      LEFT JOIN student_mastery sm
             ON sm.item_id = i.id AND sm.student_id = ?
      WHERE wi.wordbook_id = ?
      ORDER BY wi.sort_order ASC, i.id ASC
    `).all(student_id as string, wordbook_id as string)
  } else {
    items = db.prepare(`
      SELECT i.*,
             COALESCE(sm.en_to_zh_level, 0) AS en_to_zh_level,
             COALESCE(sm.zh_to_en_level, 0) AS zh_to_en_level,
             sm.spelling_level,
             sm.last_reviewed_at
      FROM items i
      LEFT JOIN student_mastery sm
             ON sm.item_id = i.id AND sm.student_id = ?
      ORDER BY i.created_at ASC
    `).all(student_id as string)
  }

  res.json(items)
})

export default router
