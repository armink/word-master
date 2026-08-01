/**
 * 腾讯云实时语音识别（WebSocket 流式）
 *
 * 文档：https://cloud.tencent.com/document/product/1093/48982
 * 接口：wss://asr.cloud.tencent.com/asr/v2/<appid>
 *
 * 引擎：
 * - 16k_zh_en：中英混合（en_to_zh 交替模式用）
 * - 16k_en：纯英文
 *
 * 音频格式：16kHz、16bit、单声道 PCM
 */

import WebSocket from 'ws'
import { buildWsUrl, uuid } from './auth'

type SttLanguage = 'zh_cn' | 'en_us'

export interface SttStreamSession {
  sendAudio(chunk: Buffer): void
  end(): void
  close(): void
}

/** 引擎模型映射 */
function engineModel(lang: SttLanguage): string {
  // 16k_zh_en：中英混合，交替模式最优
  // 16k_en：纯英文
  if (lang === 'en_us') return '16k_en'
  return '16k_zh_en'
}

/**
 * 创建腾讯云实时语音识别流式会话。
 */
export function createTencentSttSession(
  lang: SttLanguage,
  onResult: (text: string) => void,
  onError: (msg: string) => void,
): SttStreamSession {
  const APP_ID = process.env.TENCENT_APP_ID!
  const SECRET_ID = process.env.TENCENT_SECRET_ID!
  const SECRET_KEY = process.env.TENCENT_SECRET_KEY!
  const voiceId = uuid()

  let ws: WebSocket | null = null
  let finished = false
  let handshakeOk = false
  const results: string[] = []
  const pending: Buffer[] = []

  const doConnect = () => {
    const url = buildWsUrl({
      appId: APP_ID,
      secretId: SECRET_ID,
      secretKey: SECRET_KEY,
      engineModelType: engineModel(lang),
      voiceId,
    })

    ws = new WebSocket(url)

    ws.on('open', () => {
      // 冲刷积压的音频块
      for (const chunk of pending) {
        ws!.send(chunk)
      }
      pending.length = 0
    })

    ws.on('message', (raw: WebSocket.RawData) => {
      const msg = JSON.parse(raw.toString()) as {
        code: number; message: string
        final?: number
        result?: { slice_type?: number; voice_text_str?: string }
      }

      if (msg.code !== 0) {
        finished = true
        onError(`腾讯识别错误 ${msg.code}: ${msg.message}`)
        ws?.close()
        return
      }

      // 握手成功
      if (!handshakeOk && msg.message === 'success') {
        handshakeOk = true
        return
      }

      // 稳态识别结果（slice_type=2 表示一句话结束）
      if (msg.result?.slice_type === 2 && msg.result.voice_text_str) {
        results.push(msg.result.voice_text_str)
      }

      // 全部识别结束
      if (msg.final === 1) {
        finished = true
        ws?.close()
        const text = results.join('')
        if (text) onResult(text)
        else onError('未识别到内容')
      }
    })

    ws.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).message?.includes('closed before the connection was established')) return
      if (!finished) {
        finished = true
        onError('识别服务连接异常')
      }
    })

    ws.on('close', () => {
      if (!finished) {
        finished = true
        onError('识别服务连接已关闭')
      }
    })
  }

  doConnect()

  return {
    sendAudio(chunk: Buffer) {
      if (finished) return
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        pending.push(chunk)
        return
      }
      ws.send(chunk)
    },

    end() {
      if (finished) return
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        finished = true
        onResult('')
        return
      }
      ws.send(JSON.stringify({ type: 'end' }))
    },

    close() {
      finished = true
      try { ws?.terminate() } catch { /* ignore */ }
      ws = null
    },
  }
}
