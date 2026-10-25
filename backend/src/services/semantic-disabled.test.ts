/**
 * SEMANTIC_ENABLED=false 时的判题回退行为测试
 *
 * 关闭本地语义模型后：
 * - 精确匹配、拼音匹配仍然有效
 * - 近义词不再走向量匹配，直接返回 keyword 回退结果
 */
import { describe, it, expect, afterEach } from 'vitest'
import { checkSemanticMatch } from './semantic.js'

const ORIGINAL = process.env.SEMANTIC_ENABLED

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.SEMANTIC_ENABLED
  } else {
    process.env.SEMANTIC_ENABLED = ORIGINAL
  }
})

describe('SEMANTIC_ENABLED=false', () => {
  it('精确匹配仍然通过', async () => {
    process.env.SEMANTIC_ENABLED = 'false'
    const r = await checkSemanticMatch('美丽', '美丽')
    expect(r.match).toBe(true)
    expect(r.method).toBe('exact')
  })

  it('拼音匹配仍然通过', async () => {
    process.env.SEMANTIC_ENABLED = 'false'
    const r = await checkSemanticMatch('美丽', '美利')
    expect(r.match).toBe(true)
    expect(r.method).toBe('pinyin')
  })

  it('近义词不再走向量匹配', async () => {
    process.env.SEMANTIC_ENABLED = 'false'
    const r = await checkSemanticMatch('美丽', '漂亮')
    expect(r.match).toBe(false)
    expect(r.method).toBe('keyword')
  })

  it('否定表达仍然被拒绝', async () => {
    process.env.SEMANTIC_ENABLED = 'false'
    const r = await checkSemanticMatch('丑陋', '不丑陋')
    expect(r.match).toBe(false)
  })
})
