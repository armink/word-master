/**
 * students 路由测试
 *
 * 覆盖：GET /api/students、POST /api/students
 */
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../app'
import { setupTestDb } from '../__tests__/helpers'

setupTestDb()

describe('GET /api/students', () => {
  it('初始返回空数组', async () => {
    const res = await request(app).get('/api/students')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('创建后可以查到', async () => {
    await request(app).post('/api/students').send({ name: '小明' })
    const res = await request(app).get('/api/students')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].name).toBe('小明')
  })

  it('多个学生按创建顺序返回', async () => {
    await request(app).post('/api/students').send({ name: '学生A' })
    await request(app).post('/api/students').send({ name: '学生B' })
    const res = await request(app).get('/api/students')
    expect(res.body.map((s: { name: string }) => s.name)).toEqual(['学生A', '学生B'])
  })
})

describe('POST /api/students', () => {
  it('创建成功，返回 201 及完整记录', async () => {
    const res = await request(app).post('/api/students').send({ name: '小红' })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      name: '小红',
      created_at: expect.any(Number),
    })
  })

  it('自动 trim 名字两端空格', async () => {
    const res = await request(app).post('/api/students').send({ name: '  小李  ' })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('小李')
  })

  it('名字为空字符串时返回 400', async () => {
    const res = await request(app).post('/api/students').send({ name: '' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })

  it('名字为纯空白时返回 400', async () => {
    const res = await request(app).post('/api/students').send({ name: '   ' })
    expect(res.status).toBe(400)
  })

  it('缺少 name 字段时返回 400', async () => {
    const res = await request(app).post('/api/students').send({})
    expect(res.status).toBe(400)
  })
})
