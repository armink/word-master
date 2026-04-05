/**
 * semantic 路由测试
 * 覆盖：POST /api/semantic/check-chinese、POST /api/semantic/check-english
 */
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../app'

describe('POST /api/semantic/check-chinese', () => {
  it('缺少 standard 返回 400', async () => {
    const res = await request(app)
      .post('/api/semantic/check-chinese')
      .send({ answer: '节食' })
    expect(res.status).toBe(400)
  })

  it('缺少 answer 返回 400', async () => {
    const res = await request(app)
      .post('/api/semantic/check-chinese')
      .send({ standard: '节食' })
    expect(res.status).toBe(400)
  })

  it('精确匹配返回 match: true', async () => {
    const res = await request(app)
      .post('/api/semantic/check-chinese')
      .send({ standard: '节食', answer: '节食' })
    expect(res.status).toBe(200)
    expect(res.body.match).toBe(true)
  })

  it('完全不相关返回 match: false', async () => {
    const res = await request(app)
      .post('/api/semantic/check-chinese')
      .send({ standard: '节食', answer: '苹果' })
    expect(res.status).toBe(200)
    expect(res.body.match).toBe(false)
  })
})

describe('POST /api/semantic/check-english', () => {
  it('缺少 standard 返回 400', async () => {
    const res = await request(app)
      .post('/api/semantic/check-english')
      .send({ answer: 'somebody' })
    expect(res.status).toBe(400)
  })

  it('缺少 answer 返回 400', async () => {
    const res = await request(app)
      .post('/api/semantic/check-english')
      .send({ standard: 'give a lesson to sb.' })
    expect(res.status).toBe(400)
  })

  it('精确匹配返回 match: true', async () => {
    const res = await request(app)
      .post('/api/semantic/check-english')
      .send({ standard: 'give a lesson to somebody', answer: 'give a lesson to somebody' })
    expect(res.status).toBe(200)
    expect(res.body.match).toBe(true)
  })

  it('完全不匹配返回 match: false', async () => {
    const res = await request(app)
      .post('/api/semantic/check-english')
      .send({ standard: 'give a lesson to somebody', answer: 'take a nap' })
    expect(res.status).toBe(200)
    expect(res.body.match).toBe(false)
  })

  it('sb. → somebody：缩写与全称互认', async () => {
    const res = await request(app)
      .post('/api/semantic/check-english')
      .send({ standard: 'give a lesson to sb.', answer: 'give a lesson to somebody' })
    expect(res.status).toBe(200)
    expect(res.body.match).toBe(true)
  })

  it('sth. → something：缩写与全称互认', async () => {
    const res = await request(app)
      .post('/api/semantic/check-english')
      .send({ standard: 'do sth.', answer: 'do something' })
    expect(res.status).toBe(200)
    expect(res.body.match).toBe(true)
  })

  it('somebody → sb.：全称与缩写互认（反向）', async () => {
    const res = await request(app)
      .post('/api/semantic/check-english')
      .send({ standard: 'give a lesson to somebody', answer: 'give a lesson to sb.' })
    expect(res.status).toBe(200)
    expect(res.body.match).toBe(true)
  })

  it('斜杠备选 be/get：写任意一个变体', async () => {
    const res = await request(app)
      .post('/api/semantic/check-english')
      .send({ standard: 'be/get familiar with', answer: 'get familiar with' })
    expect(res.status).toBe(200)
    expect(res.body.match).toBe(true)
  })

  it('大小写不敏感', async () => {
    const res = await request(app)
      .post('/api/semantic/check-english')
      .send({ standard: 'Give A Lesson', answer: 'give a lesson' })
    expect(res.status).toBe(200)
    expect(res.body.match).toBe(true)
  })
})
