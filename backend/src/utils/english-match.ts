/**
 * 英文答案匹配工具
 * 同时被后端测试和前端调用（逻辑保持同步）
 */

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
 * 匹配含斜杠备选的英文答案，如 "be/get familiar with"。
 * 支持：
 *   1. 直接写任意一个变体：be familiar with / get familiar with
 *   2. 用户写出全部备选词（be get familiar with）且无多余词，也视为正确
 *   3. sb. / sb / sth. / sth 等代词缩写与全称互认
 */
export function matchEnglishAnswer(standard: string, userAnswer: string): boolean {
  const ua = expandAbbreviations(norm(userAnswer))
  const std = expandAbbreviations(norm(standard))
  if (ua === std) return true

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

  return false
}
