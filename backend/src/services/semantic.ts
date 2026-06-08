import { pipeline, cos_sim, env } from '@xenova/transformers'
import { pinyin } from 'pinyin-pro'

// 优先使用国内镜像，避免 huggingface.co 无法访问
env.remoteHost = 'https://hf-mirror.com'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FeaturePipeline = (input: string, options: Record<string, unknown>) => Promise<any>

let embedder: FeaturePipeline | null = null
let modelUnavailable = false   // 模型加载失败后设为 true，回退到关键词模式
let loadingPromise: Promise<FeaturePipeline> | null = null

/**
 * LLM 语义验证器（可选注入）
 *
 * 当 MiniLM 分数处于灰色地带时调用，用于最终判定两个中文短语是否语义等价。
 * 由 app 启动时通过 setLlmVerifier() 注入 DeepSeek 实现；不注入时灰色地带回退到纯阈值判断。
 * 测试中可替换为 mock 实现。
 */
export type LlmVerifier = (standard: string, answer: string) => Promise<{ match: boolean; reason: string }>
let _llmVerifier: LlmVerifier | null = null

/** 注入 LLM 语义验证器（应在 app 启动时调用） */
export function setLlmVerifier(v: LlmVerifier | null): void {
  _llmVerifier = v
}

/** 灰色地带阈值：MiniLM 分数在此区间时触发 LLM 二次验证 */
export const LLM_GRAY_ZONE = {
  /** 低于此值视为明确不匹配，直接拒绝 */
  low: 0.60,
  /** 高于等于此值视为明确匹配，直接通过 */
  high: 0.85,
}

async function getEmbedder(): Promise<FeaturePipeline | null> {
  if (modelUnavailable) return null
  if (embedder) return embedder
  if (!loadingPromise) {
    loadingPromise = (
      pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2') as Promise<FeaturePipeline>
    ).then(p => {
      embedder = p
      return p
    }).catch(err => {
      modelUnavailable = true
      loadingPromise = null   // 允许后续重试
      throw err
    })
  }
  return loadingPromise
}

/** 服务启动时后台预热，避免首次请求时卡顿 */
export function warmupSemantic(): void {
  getEmbedder()
    .then(p => p && console.log('[semantic] 模型加载完毕，语义匹配已启用'))
    .catch(err => console.warn('[semantic] 模型加载失败，已降级为关键词匹配:', (err as Error).message))
}

/** 当前模型是否可用 */
export function isSemanticModelReady(): boolean {
  return embedder !== null
}

/** 计算两段文本的余弦相似度，范围 [-1, 1] */
async function cosineSimilarity(text1: string, text2: string): Promise<number> {
  const embed = await getEmbedder()
  if (!embed) throw new Error('model unavailable')
  const [out1, out2] = await Promise.all([
    embed(text1, { pooling: 'mean', normalize: true }),
    embed(text2, { pooling: 'mean', normalize: true }),
  ])
  // cos_sim 类型声明要求 number[]，但运行时兼容 TypedArray
  const arr1 = out1.data as unknown as number[]
  const arr2 = out2.data as unknown as number[]
  return cos_sim(arr1, arr2)
}

function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/[，。！？、；：\s]/g, '')
}

/** 将中文文本转为无声调拼音串，用于同音字比较 */
function toPinyinNoTone(s: string): string {
  return pinyin(s, { toneType: 'none', separator: '' }).toLowerCase().replace(/\s/g, '')
}

/**
 * 三阶段混合语义匹配：
 * 1. 精确匹配（去标点/空格） → 即时
 * 2. 关键词包含（标准答案词片段出现在用户答案中）→ 即时
 * 3. MiniLM 向量语义相似度（需模型已加载）→ 30-100ms
 *
 * 若模型未加载，仅执行 Stage 1-2，结果依然可用。
 */
export async function checkSemanticMatch(
  standard: string,
  userAnswer: string,
): Promise<{ match: boolean; score: number; method: 'exact' | 'pinyin' | 'keyword' | 'semantic' | 'llm' }> {
  // 支持分号分隔的多义项（如「查寻；抬头看」），任一义项匹配即通过
  const segments = standard.split('；').map(s => s.trim()).filter(Boolean)
  if (segments.length > 1) {
    for (const seg of segments) {
      const r = await checkSemanticMatch(seg, userAnswer)
      if (r.match) return r
    }
    return { match: false, score: 0, method: 'keyword' }
  }

  const normStd = normalizeText(standard)
  const normAns = normalizeText(userAnswer)

  // Stage 1: 精确匹配
  if (normStd === normAns) {
    return { match: true, score: 1.0, method: 'exact' }
  }

  // Stage 1.5: 同音字匹配（无声调拼音相同视为正确）
  if (normStd.length > 0 && toPinyinNoTone(normStd) === toPinyinNoTone(normAns)) {
    return { match: true, score: 0.95, method: 'pinyin' }
  }

  // Stage 2: 关键词包含
  // 策略：从标准答案提取连续字符片段
  //  - 正向匹配（判对）：需要长度 2-4 的片段出现在用户答案中（防止单字误判）
  //  - 否定检测（拒绝）：1-4 字片段中，只要有任何一个在答案中被否定词修饰，
  //    且没有同时存在未被否定的 2-4 字片段，则直接拒绝，不走 Stage 3。
  //    这样可以捕获"不丑"（单字被否定）和"没有丑陋"（双字否定前缀）等情形。
  const NEGATION = new Set(['不', '没', '未', '非', '别', '无', '莫'])

  // 生成 2-4 字片段（用于正向匹配）
  const bigrams: string[] = []
  for (let len = 2; len <= 4; len++) {
    for (let i = 0; i <= normStd.length - len; i++) {
      bigrams.push(normStd.slice(i, i + len))
    }
  }
  const uniqueBigrams = [...new Set(bigrams)]

  // 再收集单字符（仅用于否定检测，不用于正向匹配）
  const stdSingleChars = [...new Set(normStd.split(''))]
  const allTokens = [...stdSingleChars, ...uniqueBigrams]   // 1-4 字，仅用于否定检测

  function isNegated(keyword: string): boolean {
    const idx = normAns.indexOf(keyword)
    if (idx < 0) return false
    // 单字否定：不X、没X 等
    if (idx > 0 && NEGATION.has(normAns[idx - 1])) return true
    // 双字否定："没有xxx"
    if (idx > 1 && normAns[idx - 2] === '没' && normAns[idx - 1] === '有') return true
    return false
  }

  const hasNegatedToken    = allTokens.some(k => isNegated(k))
  const hasUnNegatedBigram = uniqueBigrams.some(k => normAns.includes(k) && !isNegated(k))

  if (hasNegatedToken && !hasUnNegatedBigram) {
    // 用户答案是对标准答案的否定表达，直接拒绝（不走 Stage 3，向量模型不理解否定语义）
    return { match: false, score: 0, method: 'keyword' }
  }
  if (uniqueBigrams.length > 0 && hasUnNegatedBigram) {
    return { match: true, score: 0.85, method: 'keyword' }
  }

  // Stage 3: 语义向量相似度（模型不可用时跳过，直接返回不匹配）
  if (modelUnavailable || !embedder) {
    return { match: false, score: 0, method: 'keyword' }
  }
  const score = await cosineSimilarity(standard, userAnswer)

  // ── 灰色地带判定 ──────────────────────────────────────────────
  // MiniLM 对中文短语的区分能力有限，完全无关的短语（如"下决心"与"指导作用"）
  // 可能被误判为高分。因此将 MiniLM 分数分为三区：
  //   [0.85, 1.0]  高置信匹配 → 直接通过
  //   [0.60, 0.85) 灰色地带   → 有 LLM 则问 LLM，无则回退 0.76 阈值
  //   [0,   0.60)  高置信拒绝 → 直接拒绝
  if (score >= LLM_GRAY_ZONE.high) {
    return { match: true, score, method: 'semantic' }
  }
  if (score < LLM_GRAY_ZONE.low) {
    return { match: false, score, method: 'semantic' }
  }

  // 灰色地带：尝试 LLM 二次验证
  if (_llmVerifier) {
    try {
      const llmResult = await _llmVerifier(standard, userAnswer)
      return {
        match: llmResult.match,
        score,
        method: 'llm' as const,
      }
    } catch (err) {
      console.warn('[semantic] LLM 验证失败，回退至 MiniLM 阈值:', (err as Error).message)
    }
  }

  // 无 LLM 或 LLM 失败：回退至原 0.76 阈值
  return { match: score >= 0.76, score, method: 'semantic' }
}
