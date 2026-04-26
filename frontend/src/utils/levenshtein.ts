/** Levenshtein 编辑距离（O(n) 空间） */
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

function normalizeZh(s: string): string {
  // 先去掉括号（全角/半角）及其内容，再去标点空格
  return s
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[\s\p{P}]/gu, '')
}

/** 单个 token 对目标词的得分 (0–100) */
export function pronunciationScore(
  recognized: string,
  target: string,
  lang: 'en' | 'zh',
): number {
  const r = lang === 'en' ? normalizeEn(recognized) : normalizeZh(recognized)
  const t = lang === 'en' ? normalizeEn(target) : normalizeZh(target)
  if (!r || !t) return 0
  const dist = levenshtein(r, t)
  const maxLen = Math.max(r.length, t.length)
  return Math.max(0, Math.round((1 - dist / maxLen) * 100))
}

/**
 * 将 STT 识别结果拆分为英文词段和中文词段。
 * 例："apple苹果apple苹果" → enTokens:["apple","apple"], zhTokens:["苹果","苹果"]
 */
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

export interface RepeatRecordingResult {
  /** 本次录音识别出的完整轮数 */
  rounds: number
  /** 综合得分（含多轮奖励，0–100） */
  score: number
  /** 原始准确率得分（不含奖励，用于反馈分级） */
  rawScore: number
}

/**
 * 解析一次长按录音中的复读轮次和得分。
 * - zh_to_en：只统计英文词命中次数
 * - en_to_zh（targetZh 非 null）：英中配对，rounds = min(en命中, zh命中)
 *
 * previousRounds：调用前已累计的总轮数，用于计算奖励加分。
 * 得分公式：score = min(100, rawScore + max(0, totalRounds - 1) * 3)
 */
export function scoreRepeatRecording(
  transcript: string,
  targetEn: string,
  targetZh: string | null,
  previousRounds: number,
): RepeatRecordingResult {
  const { enTokens, zhTokens } = tokenizeTranscript(transcript)
  const enScores = enTokens.map(t => pronunciationScore(t, targetEn, 'en'))
  const zhScores = targetZh
    ? zhTokens.map(t => pronunciationScore(t, targetZh, 'zh'))
    : []

  let rounds: number
  let rawScore: number

  if (!targetZh) {
    rounds = enScores.length
    rawScore = rounds > 0
      ? Math.round(enScores.reduce((a, b) => a + b, 0) / rounds)
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
