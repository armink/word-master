import { describe, it, expect } from 'vitest'
import { matchEnglishAnswer } from './english-match.js'

describe('matchEnglishAnswer - 基础功能', () => {
  it('精确匹配', () => {
    expect(matchEnglishAnswer('give a lesson to somebody', 'give a lesson to somebody')).toBe(true)
  })

  it('大小写不敏感', () => {
    expect(matchEnglishAnswer('Give A Lesson', 'give a lesson')).toBe(true)
  })

  it('斜杠备选：写任意一个变体', () => {
    expect(matchEnglishAnswer('be/get familiar with', 'be familiar with')).toBe(true)
    expect(matchEnglishAnswer('be/get familiar with', 'get familiar with')).toBe(true)
  })

  it('完全不匹配', () => {
    expect(matchEnglishAnswer('give a lesson to somebody', 'take a nap')).toBe(false)
  })
})

describe('matchEnglishAnswer - sb./sth. 缩写识别', () => {
  it('sb. → somebody：词库存缩写，用户输全称', () => {
    expect(matchEnglishAnswer('give a lesson to sb.', 'give a lesson to somebody')).toBe(true)
  })

  it('sb（无点）→ somebody：词库存缩写，用户输全称', () => {
    expect(matchEnglishAnswer('give a lesson to sb', 'give a lesson to somebody')).toBe(true)
  })

  it('somebody → sb.：词库存全称，用户输缩写', () => {
    expect(matchEnglishAnswer('give a lesson to somebody', 'give a lesson to sb.')).toBe(true)
  })

  it('sth. → something：词库存缩写，用户输全称', () => {
    expect(matchEnglishAnswer('do sth.', 'do something')).toBe(true)
  })

  it('sth（无点）→ something：词库存缩写，用户输全称', () => {
    expect(matchEnglishAnswer('do sth', 'do something')).toBe(true)
  })

  it('sb. 与 sth. 同时出现', () => {
    expect(matchEnglishAnswer('give sth. to sb.', 'give something to somebody')).toBe(true)
  })

  it("sb.'s 所有格缩写", () => {
    expect(matchEnglishAnswer("improve sb.'s memory", "improve somebody's memory")).toBe(true)
  })

  it("sth.'s 所有格缩写", () => {
    expect(matchEnglishAnswer("change sth.'s meaning", "change something's meaning")).toBe(true)
  })

  it('虽然包含 sb 字母但不是缩写，不应误展开', () => {
    // "suburbs" 包含 "sb" 但不应被展开
    expect(matchEnglishAnswer('suburbs', 'suburbs')).toBe(true)
    expect(matchEnglishAnswer('suburbs', 'somebody')).toBe(false)
  })
})

describe('matchEnglishAnswer - 语音识别末尾标点容错', () => {
  it('STT 返回末尾英文句号应视为正确', () => {
    expect(matchEnglishAnswer('give a lesson to somebody', 'give a lesson to somebody.')).toBe(true)
  })

  it('STT 返回末尾中文句号应视为正确', () => {
    expect(matchEnglishAnswer('give a lesson to somebody', 'Give a lesson to somebody。')).toBe(true)
  })

  it('STT 返回末尾逗号应视为正确', () => {
    expect(matchEnglishAnswer('on foot', 'on foot,')).toBe(true)
  })

  it('STT + sb. 缩写 + 末尾标点同时存在应视为正确', () => {
    expect(matchEnglishAnswer('give a lesson to sb.', 'give a lesson to somebody.')).toBe(true)
  })
})
