/**
 * 英文答案匹配工具
 * 同时被后端测试和前端调用（逻辑保持同步）
 */

import { doubleMetaphone } from 'double-metaphone'

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.!?,;。！？，；]+$/, '')
    .split(' ')
    .filter(t => t !== '...' && t !== '')
    .join(' ')
}

/**
 * 把 sb. / sb / sth. / sth 及所有格形式展开为全称，
 * 仅匹配独立词元（按空格切分后整 token 比对，防止误展开 suburbs 等单词）。
 */
function expandAbbreviations(s: string): string {
  const ABBR: Record<string, string> = {
    "sb.'s": "somebody's",
    "sth.'s": "something's",
    "sb's":   "somebody's",
    "sth's":  "something's",
    'sb.':    'somebody',
    'sth.':   'something',
    'sb':     'somebody',
    'sth':    'something',
  }
  return s.split(' ').map(t => ABBR[t] ?? t).join(' ')
}

/** Levenshtein 编辑距离 */
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

/** 去除非字母字符后计算相似度（0–1） */
function alphaSimilarity(a: string, b: string): number {
  const ra = a.toLowerCase().replace(/[^a-z]/g, '')
  const rb = b.toLowerCase().replace(/[^a-z]/g, '')
  if (!ra || !rb) return 0
  const dist = levenshtein(ra, rb)
  return 1 - dist / Math.max(ra.length, rb.length)
}

/**
 * 判断两个单词是否"同音"（Double Metaphone 编码有交集）。
 * 保护规则：两词均短于 3 字母时不走语音匹配，避免 on/in 等
 * 短高频虚词编码相同却被误判为同音（high/hi 一长一短仍放行）。
 */
function isHomophone(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length < 3 && b.length < 3) return false
  const ca = doubleMetaphone(a)
  const cb = doubleMetaphone(b)
  return ca.some(x => cb.includes(x))
}

/**
 * 逐 token 同音匹配：要求词数相同，且每个位置精确相同或同音。
 * 用于容忍 STT 把某个词写成同音异形词（high→hi、grain→green）。
 */
function homophoneMatch(ua: string, std: string): boolean {
  const ut = ua.split(' ')
  const st = std.split(' ')
  if (ut.length !== st.length || ut.length === 0) return false
  return ut.every((w, i) => isHomophone(w, st[i]))
}

/**
 * 逐字母拼读匹配：用户把单词一个字母一个字母说出来（"h i g h"），
 * STT 得到以空格分隔的单字母序列，拼接后与标准答案（去空格）比对。
 * 仅当所有 token 都是单个字母且数量 > 1 时才视为拼读。
 */
function spelledOutMatch(ua: string, std: string): boolean {
  const tokens = ua.split(' ')
  if (tokens.length < 2) return false
  if (!tokens.every(t => /^[a-z]$/.test(t))) return false
  return tokens.join('') === std.replace(/\s+/g, '')
}

/** matchEnglishAnswer 选项 */
export interface MatchOptions {
  /**
   * 是否启用同音词语音容错。默认 true（中译英等语音作答场景）。
   * 拼写测验（spelling）应传 false，要求拼写精确。
   * 逐字母拼读匹配不受此选项影响，始终启用。
   */
  phonetic?: boolean
}

/**
 * 匹配含斜杠备选的英文答案，如 "be/get familiar with"。
 * 支持：
 *   1. 直接写任意一个变体：be familiar with / get familiar with
 *   2. 用户写出全部备选词（be get familiar with）且无多余词，也视为正确
 *   3. sb. / sb / sth. / sth 等代词缩写与全称互认
 *   4. STT 同音误识别容错（high→hi、grain→green），可用 phonetic:false 关闭
 *   5. 逐字母拼读容错（"h i g h" → high）
 */
export function matchEnglishAnswer(
  standard: string,
  userAnswer: string,
  options: MatchOptions = {},
): boolean {
  const { phonetic = true } = options
  const ua = expandAbbreviations(norm(userAnswer))
  const std = expandAbbreviations(norm(standard))
  if (ua === std) return true

  // 逐字母拼读：用户一个字母一个字母说出来
  if (spelledOutMatch(ua, std)) return true

  const tokens = std.split(' ')
  if (tokens.some(t => t.includes('/'))) {
    // 展开所有斜杠备选组合
    let variants: string[] = ['']
    for (const token of tokens) {
      const parts = token.split('/')
      variants = variants.flatMap(v => parts.map(p => v ? `${v} ${p}` : p))
    }
    if (variants.some(v => v === ua)) return true

    // 容错：用户写出了多个备选词（如 "be get familiar with"）
    const userTokens = ua.split(' ')
    const allStdWords = new Set(tokens.flatMap(t => t.split('/')))
    if (userTokens.every(w => allStdWords.has(w))) {
      const userSet = new Set(userTokens)
      if (tokens.every(token => token.split('/').some(p => userSet.has(p)))) return true
    }
  }

  // 模糊匹配兜底：STT 同音词误识别容错（如 now→know, to→too）
  // 阈值 0.85 可区分"now/know"(87.5%) 与"cat/hat"(67%)
  const FUZZY_THRESHOLD = 0.85
  if (alphaSimilarity(ua, std) >= FUZZY_THRESHOLD) return true

  // 语音同音匹配：字符差异大但读音相同（high→hi 相似度仅 0.5，靠编辑距离救不回）
  if (phonetic && homophoneMatch(ua, std)) return true

  return false
}
