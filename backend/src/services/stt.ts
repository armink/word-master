/**
 * STT（语音识别）抽象工厂
 *
 * 根据 STT_PROVIDER 环境变量选择服务商：
 * - xunfei（默认）：讯飞 Spark IAT
 * - tencent：腾讯云实时语音识别（16k_zh_en 中英混合引擎）
 */

import type { SttStreamSession } from './xunfei/stt'
import { createXunfeiSttSession } from './xunfei/stt'
import { createTencentSttSession } from './tencent/stt'

type SttLanguage = 'zh_cn' | 'en_us'

/** 可用的 STT 服务商 */
export type SttProvider = 'xunfei' | 'tencent'

/** 读取配置，默认 xunfei 向后兼容 */
function getSttProvider(): SttProvider {
  const p = process.env.STT_PROVIDER?.toLowerCase()
  if (p === 'tencent') return 'tencent'
  return 'xunfei'
}

/**
 * 创建一个流式语音识别会话。
 */
export function createSttSession(
  lang: SttLanguage,
  onResult: (text: string) => void,
  onError: (msg: string) => void,
): SttStreamSession {
  const provider = getSttProvider()
  if (provider === 'tencent') {
    return createTencentSttSession(lang, onResult, onError)
  }
  return createXunfeiSttSession(lang, onResult, onError)
}
