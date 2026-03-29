import { pipeline, cos_sim, env } from '@xenova/transformers'

// 优先使用国内镜像，避免 huggingface.co 无法访问
env.remoteHost = 'https://hf-mirror.com'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FeaturePipeline = (input: string, options: Record<string, unknown>) => Promise<any>

let embedder: FeaturePipeline | null = null
let modelUnavailable = false   // 模型加载失败后设为 true，回退到关键词模式
let loadingPromise: Promise<FeaturePipeline> | null = null

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
): Promise<{ match: boolean; score: number; method: 'exact' | 'keyword' | 'semantic' }> {
  const normStd = normalizeText(standard)
  const normAns = normalizeText(userAnswer)

  // Stage 1: 精确匹配
  if (normStd === normAns) {
    return { match: true, score: 1.0, method: 'exact' }
  }

  // Stage 2: 关键词包含
  // 策略：从标准答案提取所有长度 2-4 的连续字符片段（中文词通常 2-4 字），
  // 只要用户答案包含任意一个片段，视为命中核心概念、判为正确。
  // e.g. 标准"擅长做某事" → 片段含"擅长"，用户说"他很擅长" → 命中
  const bigrams: string[] = []
  for (let len = 2; len <= 4; len++) {
    for (let i = 0; i <= normStd.length - len; i++) {
      bigrams.push(normStd.slice(i, i + len))
    }
  }
  const uniqueBigrams = [...new Set(bigrams)].filter(k => k.length >= 2)
  if (uniqueBigrams.length > 0 && uniqueBigrams.some(k => normAns.includes(k))) {
    return { match: true, score: 0.85, method: 'keyword' }
  }

  // Stage 3: 语义向量相似度（模型不可用时跳过，直接返回不匹配）
  if (modelUnavailable || !embedder) {
    return { match: false, score: 0, method: 'keyword' }
  }
  const score = await cosineSimilarity(standard, userAnswer)
  // 阈值 0.60：在"成语 ↔ 白话释义"场景下得分约 0.62，不相关词得分约 0.36-0.45
  return { match: score >= 0.60, score, method: 'semantic' }
}
