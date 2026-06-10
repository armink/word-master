/**
 * 复读评分逻辑测试（对应 frontend/src/utils/levenshtein.ts 中的 scoreRepeatRecording）
 *
 * 测试范围：zh_to_en 模式下含标点符号的英文短语匹配行为
 * Bug: 含句号等标点的目标短语在正则匹配时因 tokenizeTranscript 丢弃了标点而导致 rounds=0
 */
import { describe, it, expect } from 'vitest'

// ── 从 frontend 复制核心匹配逻辑用于测试（与 levenshtein.ts 完全一致）──

function tokenizeTranscript(text: string): { enTokens: string[]; zhTokens: string[] } {
  const segments = text.match(/[a-zA-Z0-9]+|[\u4e00-\u9fa5]+/g) ?? []
  const enTokens: string[] = []
  const zhTokens: string[] = []
  for (const seg of segments) {
    if (/[a-zA-Z]/.test(seg)) enTokens.push(seg)
    else zhTokens.push(seg)
  }
  return { enTokens, zhTokens }
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const curr: number[] = [i]
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1])
    }
    prev = curr
  }
  return prev[n]
}

function normalizeEn(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function pronunciationScore(recognized: string, target: string, lang: 'en' | 'zh'): number {
  const r = lang === 'en' ? normalizeEn(recognized) : recognized.replace(/[\s\p{P}]/gu, '')
  const t = lang === 'en' ? normalizeEn(target) : target.replace(/[\s\p{P}]/gu, '')
  if (!r || !t) return 0
  const dist = levenshtein(r, t)
  const maxLen = Math.max(r.length, t.length)
  return Math.max(0, Math.round((1 - dist / maxLen) * 100))
}

function scoreRepeatRecording(
  transcript: string,
  targetEn: string,
  targetZh: string | null,
  previousRounds: number,
): { rounds: number; score: number; rawScore: number } {
  const { enTokens, zhTokens } = tokenizeTranscript(transcript)
  const enScores = enTokens.map(t => pronunciationScore(t, targetEn, 'en'))
  const zhScores = targetZh
    ? zhTokens.map(t => pronunciationScore(t, targetZh, 'zh'))
    : []

  let rounds: number
  let rawScore: number

  if (!targetZh) {
    // zh_to_en：按目标英文短语计轮次（修复后）
    // 对目标短语和转录文本统一去除标点符号后再匹配
    const stripPunct = (s: string) => s.replace(/[^a-z0-9\s]/gi, '').replace(/\s+/g, ' ').trim()
    const joined = enTokens.join(' ')
    const joinedClean = stripPunct(joined)
    const targetClean = stripPunct(targetEn)
    if (!targetClean || !joinedClean) {
      rounds = 0
    } else {
      const escaped = targetClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const matches = joinedClean.match(new RegExp(escaped, 'gi'))
      rounds = matches ? matches.length : 0
    }
    rawScore = enScores.length > 0
      ? Math.round(enScores.reduce((a, b) => a + b, 0) / enScores.length)
      : 0
  } else {
    rounds = Math.min(enScores.length, zhScores.length)
    const paired = [
      ...enScores.slice(0, rounds),
      ...zhScores.slice(0, rounds),
    ]
    rawScore = paired.length > 0
      ? Math.round(paired.reduce((a, b) => a + b, 0) / paired.length)
      : 0
  }

  const totalRounds = previousRounds + rounds
  const bonus = Math.max(0, totalRounds - 1) * 3
  const score = Math.min(100, rawScore + bonus)
  return { rounds, score, rawScore }
}

// ── 测试用例 ──────────────────────────────────────────────────────

describe('scoreRepeatRecording - zh_to_en 标点符号兼容性', () => {

  describe('Bug 场景：目标短语含句号（如 sth. sb. a.m.）', () => {

    it('STT 返回不含句号的 "struggle to do sth" 应识别到 1 轮', () => {
      // 用户说 "struggle to do sth"，STT 正确返回（无句号是常见的 STT 输出）
      const result = scoreRepeatRecording('struggle to do sth', 'struggle to do sth.', null, 0)
      expect(result.rounds).toBeGreaterThanOrEqual(1)
    })

    it('STT 返回含句号的 "struggle to do sth." 应识别到 1 轮', () => {
      const result = scoreRepeatRecording('struggle to do sth.', 'struggle to do sth.', null, 0)
      expect(result.rounds).toBeGreaterThanOrEqual(1)
    })

    it('目标短语 "make sb. do sth." 读 "make sb do sth" 应识别到 1 轮', () => {
      const result = scoreRepeatRecording('make sb do sth', 'make sb. do sth.', null, 0)
      expect(result.rounds).toBeGreaterThanOrEqual(1)
    })

    it('目标短语含句号的 "a.m." 读 "am" 应识别到 1 轮', () => {
      const result = scoreRepeatRecording('am am am', 'a.m.', null, 0)
      // STT 可能返回 "am" 而不是 "a.m."
      expect(result.rounds).toBeGreaterThanOrEqual(1)
    })
  })

  describe('正常场景：无标点的短语', () => {

    it('"break out" 重复 3 次应识别到 3 轮', () => {
      const result = scoreRepeatRecording('break out break out break out', 'break out', null, 0)
      expect(result.rounds).toBe(3)
    })

    it('"hello world" 重复 2 次应识别到 2 轮', () => {
      const result = scoreRepeatRecording('hello world hello world', 'hello world', null, 0)
      expect(result.rounds).toBe(2)
    })

    it('STT 返回完全不同的文本应识别到 0 轮', () => {
      const result = scoreRepeatRecording('goodbye', 'hello world', null, 0)
      expect(result.rounds).toBe(0)
    })

    it('STT 返回空字符串应返回 0 轮', () => {
      const result = scoreRepeatRecording('', 'break out', null, 0)
      expect(result.rounds).toBe(0)
    })
  })

  describe('en_to_zh 模式不受影响', () => {

    it('目标短语含句号不影响 en_to_zh 轮次统计', () => {
      // en_to_zh: targetZh 不为 null，走 rounds = min(enScores.length, zhScores.length)
      const result = scoreRepeatRecording(
        'struggle to do sth 努力做某事 struggle to do sth 努力做某事',
        'struggle to do sth.',
        '努力做某事',
        0
      )
      expect(result.rounds).toBe(2)
    })
  })

  describe('previousRounds 累计与得分', () => {

    it('累计轮次影响奖励加分', () => {
      const r1 = scoreRepeatRecording('break out break out', 'break out', null, 0)
      expect(r1.rounds).toBe(2)
      // 第二轮累计 2+2=4 轮，bonus = (4-1)*3 = 9
      const r2 = scoreRepeatRecording('break out break out', 'break out', null, r1.rounds)
      expect(r2.score).toBeGreaterThan(r1.score)
    })
  })
})
