/**
 * tasks 路由测试
 *
 * 覆盖：
 * 1. 纯函数 nextReviewDate —— 艾宾浩斯复习间隔计算
 * 2. GET /api/tasks/today  —— 今日任务 API
 */
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import db from '../db/client'
import app from '../app'
import { setupTestDb, createStudent, createWordbook, createItem, addItemToWordbook } from '../__tests__/helpers'
import { nextReviewDate } from './tasks'

// ─────────────────────────────────────────────
// 1. 纯函数：nextReviewDate
// ─────────────────────────────────────────────
describe('nextReviewDate()', () => {
  it('stage 0 → 当天（间隔 0 天）', () => {
    expect(nextReviewDate(0, 20240101)).toBe(20240101)
  })
  it('stage 1 → +1 天', () => {
    expect(nextReviewDate(1, 20240101)).toBe(20240102)
  })
  it('stage 2 → +3 天', () => {
    expect(nextReviewDate(2, 20240101)).toBe(20240104)
  })
  it('stage 3 → +7 天', () => {
    expect(nextReviewDate(3, 20240101)).toBe(20240108)
  })
  it('stage 4 → +14 天', () => {
    expect(nextReviewDate(4, 20240101)).toBe(20240115)
  })
  it('stage 5 → +30 天', () => {
    expect(nextReviewDate(5, 20240101)).toBe(20240131)
  })
  it('stage > 5 → 同 stage 5（上限 30 天）', () => {
    expect(nextReviewDate(6, 20240101)).toBe(20240131)
    expect(nextReviewDate(99, 20240101)).toBe(20240131)
  })
  it('跨月：1月31日 +1天 → 2月1日', () => {
    expect(nextReviewDate(1, 20240131)).toBe(20240201)
  })
  it('跨年：12月31日 +3天 → 1月3日', () => {
    expect(nextReviewDate(2, 20231231)).toBe(20240103)
  })
  it('2月跨月：2月28日 +3天 → 3月2日（非闰年）', () => {
    expect(nextReviewDate(2, 20230228)).toBe(20230303)
  })
  it('2月跨月：2月28日 +3天 → 3月2日（闰年）', () => {
    expect(nextReviewDate(2, 20240228)).toBe(20240302)
  })
})

// ─────────────────────────────────────────────
// 2. API：GET /api/tasks/today
// ─────────────────────────────────────────────
describe('GET /api/tasks/today', () => {
  setupTestDb()

  /** 快速建立学习计划 */
  function createPlan(studentId: number, wordbookId: number, dailyNew = 5) {
    const today = new Date()
    const startDate =
      today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate()
    db.prepare(`
      INSERT INTO study_plans (student_id, wordbook_id, daily_new, start_date, status)
      VALUES (?, ?, ?, ?, 'active')
    `).run(studentId, wordbookId, dailyNew, startDate)
  }

  it('缺少参数时返回 400', async () => {
    const res = await request(app).get('/api/tasks/today')
    expect(res.status).toBe(400)
  })

  it('没有激活计划时返回 404', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const res = await request(app).get(`/api/tasks/today?student_id=${sid}&wordbook_id=${wid}`)
    expect(res.status).toBe(404)
  })

  it('有计划但词本为空时新词数为 0', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    createPlan(sid, wid)
    const res = await request(app).get(`/api/tasks/today?student_id=${sid}&wordbook_id=${wid}`)
    expect(res.status).toBe(200)
    expect(res.body.new_count).toBe(0)
    expect(res.body.review_count).toBe(0)
  })

  it('新词数受 daily_new 限制', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    // 加 5 个词，daily_new=3，期望只出现 3 个新词
    for (let i = 0; i < 5; i++) {
      addItemToWordbook(wid, createItem(`word${i}`, `词${i}`), i)
    }
    createPlan(sid, wid, 3)
    const res = await request(app).get(`/api/tasks/today?student_id=${sid}&wordbook_id=${wid}`)
    expect(res.status).toBe(200)
    expect(res.body.new_count).toBe(3)
  })

  it('响应包含必要字段', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    addItemToWordbook(wid, createItem('apple', '苹果'))
    createPlan(sid, wid)
    const res = await request(app).get(`/api/tasks/today?student_id=${sid}&wordbook_id=${wid}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      plan: expect.any(Object),
      review_count: expect.any(Number),
      new_count: expect.any(Number),
      remaining_new: expect.any(Number),
      items: expect.any(Array),
    })
  })
})
