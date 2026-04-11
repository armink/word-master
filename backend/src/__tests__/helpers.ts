/**
 * 测试公共工具
 *
 * 使用方式：在每个测试文件顶部调用 setupTestDb()
 *
 * - beforeAll: 初始化 schema（:memory: DB 首次为空）
 * - afterEach:  清空所有业务数据，保证测试间完全隔离
 *
 * 注意：vitest.config.ts 已设置 pool: 'forks'，
 * 每个测试文件在独立进程运行，天然拥有独立的 :memory: 连接。
 */
import { beforeAll, afterEach } from 'vitest'
import { initSchema } from '../db/schema'
import db from '../db/client'

export function setupTestDb() {
  beforeAll(() => {
    initSchema()
  })

  afterEach(() => {
    // 按外键依赖顺序从子表到父表删除，保留 schema
    db.exec(`
      DELETE FROM quiz_answers;
      DELETE FROM session_items;
      DELETE FROM quiz_sessions;
      DELETE FROM student_mastery;
      DELETE FROM wordbook_items;
      DELETE FROM items;
      DELETE FROM study_plans;
      DELETE FROM wordbooks;
      DELETE FROM students;
    `)
  })
}

/** 快速插入一条学生记录，返回 id */
export function createStudent(name = '测试学生'): number {
  return Number(db.prepare('INSERT INTO students (name) VALUES (?)').run(name).lastInsertRowid)
}

/** 快速插入一个单词本，返回 id */
export function createWordbook(name = '测试词本'): number {
  return Number(db.prepare('INSERT INTO wordbooks (name) VALUES (?)').run(name).lastInsertRowid)
}

/** 快速插入一条词条，返回 id */
export function createItem(english: string, chinese: string, type: 'word' | 'phrase' = 'word'): number {
  return Number(
    db.prepare("INSERT INTO items (type, english, chinese) VALUES (?, ?, ?)").run(type, english, chinese).lastInsertRowid
  )
}

/** 将词条关联到单词本 */
export function addItemToWordbook(wordbookId: number, itemId: number, sortOrder = 0) {
  db.prepare('INSERT INTO wordbook_items (wordbook_id, item_id, sort_order) VALUES (?, ?, ?)').run(wordbookId, itemId, sortOrder)
}

/** 快速创建激活的学习计划，返回 id
 *  remainingDays: 计划剩余天数（默认 1 → 所有词当天全出）
 *  targetLevel:   目标层级 1/2/3（默认 3）
 */
export function createPlan(studentId: number, wordbookId: number, remainingDays = 1, targetLevel = 3): number {
  const d = new Date()
  const startDate = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
  return Number(
    db.prepare(`
      INSERT INTO study_plans (student_id, wordbook_id, daily_new, remaining_days, target_level, start_date, status)
      VALUES (?, ?, 5, ?, ?, ?, 'active')
    `).run(studentId, wordbookId, remainingDays, targetLevel, startDate).lastInsertRowid
  )
}

/** 查询学生对某词条的掌握度记录 */
export function getMastery(studentId: number, itemId: number): Record<string, unknown> | undefined {
  return db.prepare(
    'SELECT * FROM student_mastery WHERE student_id = ? AND item_id = ?'
  ).get(studentId, itemId) as Record<string, unknown> | undefined
}
