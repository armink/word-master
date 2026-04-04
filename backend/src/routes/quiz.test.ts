/**
 * quiz 路由测试
 *
 * 覆盖：
 * - POST /api/quiz/sessions      — 创建会话
 * - GET  /api/quiz/sessions/:id  — 查询会话
 * - POST /api/quiz/sessions/:id/answers  — 提交答案
 * - POST /api/quiz/sessions/:id/finish   — 结束会话 + 正确率计算
 */
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../app'
import { setupTestDb, createStudent, createWordbook, createItem, addItemToWordbook } from '../__tests__/helpers'

setupTestDb()

// ─── 辅助：初始化标准测试数据 ──────────────────────────────────────
function seed() {
  const studentId = createStudent('测试学生')
  const wordbookId = createWordbook('测试词本')
  const itemId1 = createItem('apple', '苹果', 'word')
  const itemId2 = createItem('banana', '香蕉', 'word')
  addItemToWordbook(wordbookId, itemId1, 0)
  addItemToWordbook(wordbookId, itemId2, 1)
  return { studentId, wordbookId, itemId1, itemId2 }
}

async function createSession(studentId: number, wordbookId: number, quizType = 'en_to_zh') {
  return request(app).post('/api/quiz/sessions').send({
    student_id: studentId,
    wordbook_id: wordbookId,
    quiz_type: quizType,
  })
}

// ─── POST /api/quiz/sessions ───────────────────────────────────────
describe('POST /api/quiz/sessions', () => {
  it('创建成功，返回 201 及 session + items', async () => {
    const { studentId, wordbookId } = seed()
    const res = await createSession(studentId, wordbookId)
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      student_id: studentId,
      wordbook_id: wordbookId,
      quiz_type: 'en_to_zh',
      status: 'in_progress',
      total_words: 2,
    })
    expect(res.body.items).toHaveLength(2)
  })

  it('缺少必要参数返回 400', async () => {
    const res = await request(app).post('/api/quiz/sessions').send({ student_id: 1 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/缺少/)
  })

  it('无效 quiz_type 返回 400', async () => {
    const { studentId, wordbookId } = seed()
    const res = await createSession(studentId, wordbookId, 'invalid_type')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/quiz_type/)
  })

  it('学生不存在返回 404', async () => {
    const { wordbookId } = seed()
    const res = await createSession(99999, wordbookId)
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/学生/)
  })

  it('单词本不存在返回 404', async () => {
    const { studentId } = seed()
    const res = await createSession(studentId, 99999)
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/单词本/)
  })

  it('词本为空时返回 400', async () => {
    const studentId = createStudent()
    const wordbookId = createWordbook('空词本')
    const res = await createSession(studentId, wordbookId)
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/没有/)
  })

  it('spelling 模式只返回 word 类型词条', async () => {
    const studentId = createStudent()
    const wordbookId = createWordbook()
    const wordId = createItem('run', '跑', 'word')
    const phraseId = createItem('run away', '逃跑', 'phrase')
    addItemToWordbook(wordbookId, wordId, 0)
    addItemToWordbook(wordbookId, phraseId, 1)

    const res = await createSession(studentId, wordbookId, 'spelling')
    expect(res.status).toBe(201)
    // phrase 不应出现在 spelling 测验中
    expect(res.body.items).toHaveLength(1)
    expect(res.body.items[0].english).toBe('run')
  })
})

// ─── GET /api/quiz/sessions/:id ───────────────────────────────────
describe('GET /api/quiz/sessions/:id', () => {
  it('查询已创建会话成功', async () => {
    const { studentId, wordbookId } = seed()
    const createRes = await createSession(studentId, wordbookId)
    const sessionId = createRes.body.id

    const res = await request(app).get(`/api/quiz/sessions/${sessionId}`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(sessionId)
    expect(res.body.items).toHaveLength(2)
  })

  it('不存在的会话返回 404', async () => {
    const res = await request(app).get('/api/quiz/sessions/99999')
    expect(res.status).toBe(404)
  })
})

// ─── POST /api/quiz/sessions/:id/answers ──────────────────────────
describe('POST /api/quiz/sessions/:id/answers', () => {
  it('提交答案成功，返回 201 及答案记录', async () => {
    const { studentId, wordbookId, itemId1 } = seed()
    const session = (await createSession(studentId, wordbookId)).body

    const res = await request(app)
      .post(`/api/quiz/sessions/${session.id}/answers`)
      .send({ item_id: itemId1, user_answer: '苹果', is_correct: true, duration_ms: 1200 })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      session_id: session.id,
      item_id: itemId1,
      attempt: 1,
      is_correct: 1,
    })
  })

  it('重复作答同一词条，attempt 自动递增', async () => {
    const { studentId, wordbookId, itemId1 } = seed()
    const session = (await createSession(studentId, wordbookId)).body

    await request(app)
      .post(`/api/quiz/sessions/${session.id}/answers`)
      .send({ item_id: itemId1, user_answer: '错误', is_correct: false })
    const res = await request(app)
      .post(`/api/quiz/sessions/${session.id}/answers`)
      .send({ item_id: itemId1, user_answer: '苹果', is_correct: true })

    expect(res.status).toBe(201)
    expect(res.body.attempt).toBe(2)
  })

  it('缺少必要字段返回 400', async () => {
    const { studentId, wordbookId } = seed()
    const session = (await createSession(studentId, wordbookId)).body
    const res = await request(app)
      .post(`/api/quiz/sessions/${session.id}/answers`)
      .send({ item_id: 1 })
    expect(res.status).toBe(400)
  })

  it('会话不存在返回 404', async () => {
    const res = await request(app)
      .post('/api/quiz/sessions/99999/answers')
      .send({ item_id: 1, user_answer: '苹果', is_correct: true })
    expect(res.status).toBe(404)
  })
})

// ─── POST /api/quiz/sessions/:id/finish ───────────────────────────
describe('POST /api/quiz/sessions/:id/finish', () => {
  it('全部答对 → passed=true，final_accuracy=1', async () => {
    const { studentId, wordbookId, itemId1, itemId2 } = seed()
    const session = (await createSession(studentId, wordbookId)).body

    await request(app).post(`/api/quiz/sessions/${session.id}/answers`)
      .send({ item_id: itemId1, user_answer: '苹果', is_correct: true })
    await request(app).post(`/api/quiz/sessions/${session.id}/answers`)
      .send({ item_id: itemId2, user_answer: '香蕉', is_correct: true })

    const res = await request(app).post(`/api/quiz/sessions/${session.id}/finish`)
    expect(res.status).toBe(200)
    expect(res.body.passed).toBe(true)
    expect(res.body.session.status).toBe('passed')
    expect(res.body.final_accuracy).toBe(1)
  })

  it('全部答错 → passed=false，final_accuracy=0', async () => {
    const { studentId, wordbookId, itemId1, itemId2 } = seed()
    const session = (await createSession(studentId, wordbookId)).body

    await request(app).post(`/api/quiz/sessions/${session.id}/answers`)
      .send({ item_id: itemId1, user_answer: '错', is_correct: false })
    await request(app).post(`/api/quiz/sessions/${session.id}/answers`)
      .send({ item_id: itemId2, user_answer: '错', is_correct: false })

    const res = await request(app).post(`/api/quiz/sessions/${session.id}/finish`)
    expect(res.status).toBe(200)
    expect(res.body.passed).toBe(false)
    expect(res.body.session.status).toBe('abandoned')
    expect(res.body.final_accuracy).toBe(0)
  })

  it('正确率 0.5（pass_accuracy=0.8）→ passed=false', async () => {
    const { studentId, wordbookId, itemId1, itemId2 } = seed()
    const session = (await createSession(studentId, wordbookId)).body

    await request(app).post(`/api/quiz/sessions/${session.id}/answers`)
      .send({ item_id: itemId1, user_answer: '苹果', is_correct: true })
    await request(app).post(`/api/quiz/sessions/${session.id}/answers`)
      .send({ item_id: itemId2, user_answer: '错', is_correct: false })

    const res = await request(app).post(`/api/quiz/sessions/${session.id}/finish`)
    expect(res.status).toBe(200)
    expect(res.body.passed).toBe(false)
    expect(res.body.session.status).toBe('abandoned')
    expect(res.body.final_accuracy).toBe(0.5)
  })

  it('重复 finish 返回 400', async () => {
    const { studentId, wordbookId } = seed()
    const session = (await createSession(studentId, wordbookId)).body
    await request(app).post(`/api/quiz/sessions/${session.id}/finish`)
    const res = await request(app).post(`/api/quiz/sessions/${session.id}/finish`)
    expect(res.status).toBe(400)
  })

  it('会话不存在返回 404', async () => {
    const res = await request(app).post('/api/quiz/sessions/99999/finish')
    expect(res.status).toBe(404)
  })
})
