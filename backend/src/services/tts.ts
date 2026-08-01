/**
 * TTS（语音合成）抽象工厂
 *
 * 根据 TTS_PROVIDER 环境变量选择服务商：
 * - xunfei（默认）：讯飞在线语音合成 v2
 */

import { synthesize as xunfeiSynthesize } from './xunfei/tts'

/**
 * 合成语音并返回 MP3 Buffer。
 */
export async function synthesize(text: string, vcn?: string): Promise<Buffer> {
  return xunfeiSynthesize(text, vcn)
}
