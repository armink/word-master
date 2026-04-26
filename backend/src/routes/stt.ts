import { Router } from 'express'
import express from 'express'
import type { IncomingMessage } from 'http'
import WebSocket from 'ws'
import { recognize, mergeResult } from '../services/xunfei/stt'
import type { IatResultText } from '../services/xunfei/stt'
import { buildWsAuthUrl } from '../services/xunfei/auth'

const router = Router()

router.post('/', express.raw({ type: () => true, limit: '10mb' }), async (req, res) => {
  const lang = req.query.lang === 'en_us' ? 'en_us' : 'zh_cn'
  const audio = req.body as Buffer

  if (!Buffer.isBuffer(audio) || audio.length === 0) {
    res.status(400).json({ error: '音频数据为空' })
    return
  }

  try {
    const text = await recognize(audio, lang)
    res.json({ text })
  } catch (e) {
    console.error('STT error:', e)
    res.status(500).json({ error: (e as Error).message })
  }
})

export default router

type SttLanguage = 'zh_cn' | 'en_us'

/**
 * 流式 STT WebSocket 处理器。
 * 客户端：按住 → 发送 binary PCM 块 → 松手发送文本 "done"
 * 服务端：实时转发给讯飞 IAT → 收到最终结果后回传 {text} 给客户端
 */
export function handleSttStream(clientWs: WebSocket, req: IncomingMessage): void {
  const urlObj  = new URL(req.url ?? '/', 'http://localhost')
  const lang: SttLanguage = urlObj.searchParams.get('lang') === 'en_us' ? 'en_us' : 'zh_cn'

  const APP_ID  = process.env.XUNFEI_APP_ID!
  const iatWs   = new WebSocket(buildWsAuthUrl('iat.xf-yun.com', '/v1'))

  let resultBuf     = new Map<number, string>()
  let seq           = 0
  let firstSent     = false
  let finished      = false
  const pending: Buffer[] = []  // WS 建立前积压的音频块

  // terminate() 在 TCP 握手完成前（_socket 未赋值）也会抛出，直接 try-catch 静默处理
  const terminateIat = () => {
    try {
      iatWs.terminate()
    } catch {
      // 连接尚未建立，忽略
    }
  }

  // ── 向讯飞发送一块 PCM 数据 ────────────────────────────────────
  const sendToIat = (chunk: Buffer) => {
    if (iatWs.readyState !== WebSocket.OPEN) { pending.push(chunk); return }
    seq++
    const msg = firstSent
      ? {
          header: { app_id: APP_ID, status: 1 },
          payload: { audio: { encoding: 'raw', sample_rate: 16000, channels: 1, bit_depth: 16, seq, status: 1, audio: chunk.toString('base64') } },
        }
      : {
          header: { app_id: APP_ID, status: 0 },
          parameter: {
            iat: {
              domain: 'slm', language: 'zh_cn', accent: 'mandarin',
              eos: 5000, dwa: 'wpgs', ptt: 0,
              ...(lang === 'en_us' ? { ltc: 3 } : {}),
              result: { encoding: 'utf8', compress: 'raw', format: 'json' },
            },
          },
          payload: { audio: { encoding: 'raw', sample_rate: 16000, channels: 1, bit_depth: 16, seq, status: 0, audio: chunk.toString('base64') } },
        }
    firstSent = true
    iatWs.send(JSON.stringify(msg))
  }

  // ── 讯飞 WS 就绪：冲刷积压块 ──────────────────────────────────
  iatWs.on('open', () => {
    for (const chunk of pending) sendToIat(chunk)
    pending.length = 0
  })

  // ── 讯飞 WS 返回识别结果 ───────────────────────────────────────
  iatWs.on('message', (raw: WebSocket.RawData) => {
    const msg = JSON.parse(raw.toString()) as {
      header: { code: number; message: string; status: number }
      payload?: { result?: { text: string } }
    }
    if (msg.header.code !== 0) {
      finished = true
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ error: `识别服务错误 ${msg.header.code}: ${msg.header.message}` }))
        clientWs.close()
      }
      terminateIat(); return
    }
    if (msg.payload?.result?.text) {
      try {
        const decoded = Buffer.from(msg.payload.result.text, 'base64').toString('utf8')
        resultBuf = mergeResult(resultBuf, JSON.parse(decoded) as IatResultText)
      } catch { /* ignore */ }
    }
    if (msg.header.status === 2) {
      finished = true
      const text = [...resultBuf.entries()].sort(([a], [b]) => a - b).map(([, v]) => v).join('')
      if (clientWs.readyState === WebSocket.OPEN) { clientWs.send(JSON.stringify({ text })); clientWs.close() }
    }
  })

  iatWs.on('error', (err) => {
    // terminate() 在连接尚未建立时会触发此 error 事件，属预期行为，忽略
    if ((err as NodeJS.ErrnoException).message?.includes('closed before the connection was established')) return
    console.error('Xunfei IAT WS error:', err)
    if (!finished) {
      finished = true
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ error: '识别服务连接异常' }))
        clientWs.close()
      }
    }
  })

  // ── 来自客户端的消息 ───────────────────────────────────────────
  clientWs.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
    if (isBinary) {
      sendToIat(Buffer.from(data as ArrayBuffer))
    } else {
      const cmd = data.toString()
      if (cmd === 'done') {
        if (!firstSent) {
          // 没有音频（用户极快松手）→ 直接返回空
          finished = true
          clientWs.send(JSON.stringify({ text: '' })); clientWs.close(); terminateIat(); return
        }
        // 发送结束帧，讯飞会在收到所有帧后返回最终结果
        seq++
        iatWs.send(JSON.stringify({
          header: { app_id: APP_ID, status: 2 },
          payload: { audio: { encoding: 'raw', sample_rate: 16000, channels: 1, bit_depth: 16, seq, status: 2, audio: '' } },
        }))
      }
      // 'cancel' 或其他：客户端主动关闭 WS 即可，下方 close 事件会处理
    }
  })

  // ── 客户端断开：清理讯飞连接 ──────────────────────────────────
  clientWs.on('close', () => { if (!finished) { finished = true; terminateIat() } })
  clientWs.on('error', () => { if (!finished) { finished = true; terminateIat() } })
}
