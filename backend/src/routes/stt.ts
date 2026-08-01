import { Router } from 'express'
import type { IncomingMessage } from 'http'
import WebSocket from 'ws'
import { createSttSession } from '../services/stt'

const router = Router()

export default router

type SttLanguage = 'zh_cn' | 'en_us'

/**
 * 流式 STT WebSocket 处理器。
 * 客户端：按住 → 发送 binary PCM 块 → 松手发送文本 "done"
 * 服务端：通过抽象工厂选择讯飞/百度 → 实时转发 → 回传 {text} 给客户端
 */
export function handleSttStream(clientWs: WebSocket, req: IncomingMessage): void {
  const urlObj = new URL(req.url ?? '/', 'http://localhost')
  const lang: SttLanguage = urlObj.searchParams.get('lang') === 'en_us' ? 'en_us' : 'zh_cn'
  let finished = false

  const sendToClient = (msg: object) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify(msg))
    }
  }

  const session = createSttSession(
    lang,
    // onResult
    (text) => {
      finished = true
      sendToClient({ text })
      clientWs.close()
    },
    // onError
    (errMsg) => {
      finished = true
      console.error('STT error:', errMsg)
      sendToClient({ error: errMsg })
      clientWs.close()
    },
  )

  // ── 来自客户端的消息 ───────────────────────────────────────────
  clientWs.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
    if (finished) return
    if (isBinary) {
      session.sendAudio(Buffer.from(data as ArrayBuffer))
    } else {
      const cmd = data.toString()
      if (cmd === 'done') {
        session.end()
      }
    }
  })

  // ── 客户端断开：清理会话 ───────────────────────────────────────
  clientWs.on('close', () => {
    if (!finished) { finished = true; session.close() }
  })
  clientWs.on('error', () => {
    if (!finished) { finished = true; session.close() }
  })
}
