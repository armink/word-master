import { Router } from 'express'
import db from '../db/client'
import type { WordbookRow, WordbookWithCount, ItemType } from '../types/index'

const router = Router()

// GET /api/wordbooks
router.get('/', (_req, res) => {
  const wordbooks = db.prepare(`
    SELECT w.*, COUNT(wi.item_id) AS item_count
    FROM wordbooks w
    LEFT JOIN wordbook_items wi ON wi.wordbook_id = w.id
    GROUP BY w.id
    ORDER BY w.created_at DESC
  `).all() as WordbookWithCount[]
  res.json(wordbooks)
})

// POST /api/wordbooks
router.post('/', (req, res) => {
  const { name, description } = req.body
  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ error: '单词本名称不能为空' })
    return
  }
  const result = db.prepare(
    'INSERT INTO wordbooks (name, description) VALUES (?, ?)'
  ).run(name.trim(), description ?? null)
  const wordbook = db.prepare('SELECT * FROM wordbooks WHERE id = ?').get(result.lastInsertRowid) as WordbookRow
  res.status(201).json(wordbook)
})

// GET /api/wordbooks/:id
router.get('/:id', (req, res) => {
  const wordbook = db.prepare('SELECT * FROM wordbooks WHERE id = ?').get(req.params.id) as WordbookRow | undefined
  if (!wordbook) {
    res.status(404).json({ error: '单词本不存在' })
    return
  }
  const items = db.prepare(`
    SELECT i.*, wi.sort_order
    FROM items i
    JOIN wordbook_items wi ON wi.item_id = i.id
    WHERE wi.wordbook_id = ?
    ORDER BY wi.sort_order ASC, i.id ASC
  `).all(req.params.id)
  res.json({ ...wordbook, items })
})

// DELETE /api/wordbooks/:id
router.delete('/:id', (req, res) => {
  const wordbook = db.prepare('SELECT id FROM wordbooks WHERE id = ?').get(req.params.id)
  if (!wordbook) {
    res.status(404).json({ error: '单词本不存在' })
    return
  }
  db.prepare('DELETE FROM wordbooks WHERE id = ?').run(req.params.id)
  res.status(204).send()
})

// GET /api/wordbooks/:id/export
// 返回与导入格式相同的纯文本：每行 english:chinese
router.get('/:id/export', (req, res) => {
  const wordbook = db.prepare('SELECT * FROM wordbooks WHERE id = ?').get(req.params.id) as WordbookRow | undefined
  if (!wordbook) {
    res.status(404).json({ error: '单词本不存在' })
    return
  }
  const items = db.prepare(`
    SELECT i.english, i.chinese
    FROM items i
    JOIN wordbook_items wi ON wi.item_id = i.id
    WHERE wi.wordbook_id = ?
    ORDER BY wi.sort_order ASC, i.id ASC
  `).all(req.params.id) as { english: string; chinese: string }[]
  const text = items.map(it => `${it.english}:${it.chinese}`).join('\n')
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.send(text)
})

// POST /api/wordbooks/:id/import
// Body: { text: "apple:苹果\nbanana:香蕉" }  or  "apple:苹果;banana:香蕉"
router.post('/:id/import', (req, res) => {
  const wordbook = db.prepare('SELECT id FROM wordbooks WHERE id = ?').get(req.params.id)
  if (!wordbook) {
    res.status(404).json({ error: '单词本不存在' })
    return
  }
  const { text } = req.body
  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'text 字段不能为空' })
    return
  }

  // 按换行或分号分隔，每条格式为 english:chinese
  const entries = text.split(/[\n;]/).map((s: string) => s.trim()).filter(Boolean)

  const importTx = db.transaction(() => {
    let imported = 0
    let skipped = 0

    const nextRow = db.prepare(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM wordbook_items WHERE wordbook_id = ?'
    ).get(req.params.id) as { next: number }
    let sortOrder = nextRow.next

    for (const entry of entries) {
      const colonIdx = entry.indexOf(':')
      if (colonIdx === -1) { skipped++; continue }

      const english = entry.slice(0, colonIdx).trim()
      const chinese = entry.slice(colonIdx + 1).trim()
      if (!english || !chinese) { skipped++; continue }

      // 有空格视为短语，否则为单词
      const type: ItemType = english.includes(' ') ? 'phrase' : 'word'

      const itemResult = db.prepare(
        'INSERT INTO items (type, english, chinese) VALUES (?, ?, ?)'
      ).run(type, english, chinese)

      db.prepare(
        'INSERT OR IGNORE INTO wordbook_items (wordbook_id, item_id, sort_order) VALUES (?, ?, ?)'
      ).run(req.params.id, itemResult.lastInsertRowid, sortOrder++)

      imported++
    }
    return { imported, skipped }
  })

  const result = importTx()
  res.json({ success: true, ...result })
})

export default router
