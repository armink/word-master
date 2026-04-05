/**
 * 同音字匹配（Stage 1.5 pinyin）专项测试
 * 覆盖 Bug：用户输入同音字（如"届时"代替"节食"）应被判为正确
 */
import { describe, it, expect } from 'vitest'
import { checkSemanticMatch } from './semantic.js'

describe('同音字匹配 - Stage 1.5 pinyin', () => {
  it('节食 vs 届时：同音字应判为正确，method=pinyin', async () => {
    const result = await checkSemanticMatch('节食', '届时')
    expect(result.match).toBe(true)
    expect(result.method).toBe('pinyin')
  })

  it('节食 vs 结实：同音字应判为正确，method=pinyin', async () => {
    const result = await checkSemanticMatch('节食', '结实')
    expect(result.match).toBe(true)
    expect(result.method).toBe('pinyin')
  })

  it('意思 vs 一丝：同音字应判为正确，method=pinyin', async () => {
    const result = await checkSemanticMatch('意思', '一丝')
    expect(result.match).toBe(true)
    expect(result.method).toBe('pinyin')
  })

  it('节食 vs 健身：不同音，不应误判为正确', async () => {
    const result = await checkSemanticMatch('节食', '健身')
    expect(result.match).toBe(false)
  })

  it('节食 vs 结局：不同音，不应误判为正确', async () => {
    const result = await checkSemanticMatch('节食', '结局')
    expect(result.match).toBe(false)
  })

  it('精确匹配优先于拼音匹配，method=exact', async () => {
    const result = await checkSemanticMatch('节食', '节食')
    expect(result.match).toBe(true)
    expect(result.method).toBe('exact')
  })
})
