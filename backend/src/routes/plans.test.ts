/**
 * plans 路由测试
 *
 * 覆盖：
 * - GET  /api/plans                — 查询计划
 * - POST /api/plans                — 创建/替换计划（含 target_level 验证）
 * - PATCH /api/plans/:id           — 修改计划字段（含 target_level 修改验证）
 */
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../app'
import { setupTestDb, createStudent, createWordbook } from '../__tests__/helpers'

setupTestDb()

// ── 辅助 ──────────────────────────────────────────────────────────────

async function apiCreatePlan(body: Record<string, unknown>) {
  return request(app).post('/api/plans').send(body)
}

async function apiPatchPlan(id: number, body: Record<string, unknown>) {
  return request(app).patch(`/api/plans/${id}`).send(body)
}

// ══════════════════════════════════════════════════════════════════════
// 1. POST /api/plans — 创建计划
// ══════════════════════════════════════════════════════════════════════
describe('POST /api/plans', () => {
  it('缺少必要参数返回 400', async () => {
    const res = await apiCreatePlan({ student_id: 1, wordbook_id: 1 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/缺少/)
  })

  it('remaining_days 超范围返回 400', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const res = await apiCreatePlan({ student_id: sid, wordbook_id: wid, remaining_days: 0 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/remaining_days/)
  })

  it('daily_peak 超范围返回 400', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const res = await apiCreatePlan({ student_id: sid, wordbook_id: wid, remaining_days: 7, daily_peak: 300 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/daily_peak/)
  })

  it('学生不存在返回 404', async () => {
    const wid = createWordbook()
    const res = await apiCreatePlan({ student_id: 99999, wordbook_id: wid, remaining_days: 7 })
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/学生/)
  })

  it('单词本不存在返回 404', async () => {
    const sid = createStudent()
    const res = await apiCreatePlan({ student_id: sid, wordbook_id: 99999, remaining_days: 7 })
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/单词本/)
  })

  it('成功创建计划，target_level 默认为 3', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const res = await apiCreatePlan({ student_id: sid, wordbook_id: wid, remaining_days: 14 })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      student_id: sid,
      wordbook_id: wid,
      remaining_days: 14,
      target_level: 3,
      status: 'active',
    })
  })

  it('成功创建计划, target_level=1', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const res = await apiCreatePlan({ student_id: sid, wordbook_id: wid, remaining_days: 7, target_level: 1 })
    expect(res.status).toBe(201)
    expect(res.body.target_level).toBe(1)
  })

  it('成功创建计划, target_level=2', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const res = await apiCreatePlan({ student_id: sid, wordbook_id: wid, remaining_days: 7, target_level: 2 })
    expect(res.status).toBe(201)
    expect(res.body.target_level).toBe(2)
  })

  it('target_level=0 返回 400', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const res = await apiCreatePlan({ student_id: sid, wordbook_id: wid, remaining_days: 7, target_level: 0 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/target_level/)
  })

  it('target_level=4 返回 400', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const res = await apiCreatePlan({ student_id: sid, wordbook_id: wid, remaining_days: 7, target_level: 4 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/target_level/)
  })

  it('target_level 为字符串无效值返回 400', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const res = await apiCreatePlan({ student_id: sid, wordbook_id: wid, remaining_days: 7, target_level: 'high' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/target_level/)
  })

  it('重复 upsert 保留最新 target_level', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    await apiCreatePlan({ student_id: sid, wordbook_id: wid, remaining_days: 7, target_level: 1 })
    const res2 = await apiCreatePlan({ student_id: sid, wordbook_id: wid, remaining_days: 14, target_level: 2 })
    expect(res2.status).toBe(201)
    expect(res2.body.target_level).toBe(2)
    expect(res2.body.remaining_days).toBe(14)
  })
})

// ══════════════════════════════════════════════════════════════════════
// 2. GET /api/plans — 查询计划
// ══════════════════════════════════════════════════════════════════════
describe('GET /api/plans', () => {
  it('缺少参数返回 400', async () => {
    const res = await request(app).get('/api/plans')
    expect(res.status).toBe(400)
  })

  it('计划不存在返回 404', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const res = await request(app).get(`/api/plans?student_id=${sid}&wordbook_id=${wid}`)
    expect(res.status).toBe(404)
  })

  it('返回计划包含 target_level 字段', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    await apiCreatePlan({ student_id: sid, wordbook_id: wid, remaining_days: 7, target_level: 2 })
    const res = await request(app).get(`/api/plans?student_id=${sid}&wordbook_id=${wid}`)
    expect(res.status).toBe(200)
    expect(res.body.target_level).toBe(2)
  })
})

// ══════════════════════════════════════════════════════════════════════
// 3. PATCH /api/plans/:id — 修改计划
// ══════════════════════════════════════════════════════════════════════
describe('PATCH /api/plans/:id', () => {
  it('计划不存在返回 404', async () => {
    const res = await apiPatchPlan(99999, { remaining_days: 7 })
    expect(res.status).toBe(404)
  })

  it('修改 target_level=1 → 成功', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const created = await apiCreatePlan({ student_id: sid, wordbook_id: wid, remaining_days: 7, target_level: 3 })
    const res = await apiPatchPlan(created.body.id, { target_level: 1 })
    expect(res.status).toBe(200)
    expect(res.body.target_level).toBe(1)
  })

  it('修改 target_level=2 → 成功', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const created = await apiCreatePlan({ student_id: sid, wordbook_id: wid, remaining_days: 7 })
    const res = await apiPatchPlan(created.body.id, { target_level: 2 })
    expect(res.status).toBe(200)
    expect(res.body.target_level).toBe(2)
  })

  it('target_level=0 返回 400', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const created = await apiCreatePlan({ student_id: sid, wordbook_id: wid, remaining_days: 7 })
    const res = await apiPatchPlan(created.body.id, { target_level: 0 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/target_level/)
  })

  it('target_level=4 返回 400', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const created = await apiCreatePlan({ student_id: sid, wordbook_id: wid, remaining_days: 7 })
    const res = await apiPatchPlan(created.body.id, { target_level: 4 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/target_level/)
  })

  it('不传 target_level 时不修改原值', async () => {
    const sid = createStudent()
    const wid = createWordbook()
    const created = await apiCreatePlan({ student_id: sid, wordbook_id: wid, remaining_days: 7, target_level: 1 })
    const res = await apiPatchPlan(created.body.id, { remaining_days: 14 })
    expect(res.status).toBe(200)
    expect(res.body.target_level).toBe(1)    // 未被覆盖
    expect(res.body.remaining_days).toBe(14)
  })
})
