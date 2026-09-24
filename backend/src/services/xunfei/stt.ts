import WebSocket from 'ws'
import { buildWsAuthUrl } from './auth'

// 语音听写大模型（中英）V2.0 接口：iat.cn-huabei-1.xf-yun.com/v1
// 文档：https://www.xfyun.cn/doc/spark/spark_zh_iat_new.html
// 注意：V1（iat.xf-yun.com/v1 + domain=slm）与 V2.0 是两个独立授权的栏目，
// 只开通 V2.0 时用 V1 参数调用会返回 11201 licc failed。
// V2.0 关键差异：host 带 cn-huabei-1、domain=spark_asr_v2、每帧都需携带 parameter。
// 支持中英文及202种方言自动识别，language 固定 zh_cn
// lang='en_us' 时设置 ltc=3 只输出英文字符

type SttLanguage = 'zh_cn' | 'en_us'

export interface SttStreamSession {
  /** 发送 PCM 音频块（Int16, 16kHz, mono） */
  sendAudio(chunk: Buffer): void
  /** 告知音频已结束，等待最终识别结果 */
  end(): void
  /** 异常终止当前会话 */
  close(): void
}

export interface IatResultText {
  sn: number
  pgs?: 'apd' | 'rpl'
  rg?: [number, number]
  ws: Array<{ bg: number; cw: Array<{ w: string }> }>
  ls?: boolean
}

export function mergeResult(buf: Map<number, string>, result: IatResultText): Map<number, string> {
  const text = result.ws.map(w => w.cw[0]?.w ?? '').join('')
  const updated = new Map(buf)
  if (!result.pgs || result.pgs === 'apd') {
    updated.set(result.sn, text)
  } else if (result.pgs === 'rpl' && result.rg) {
    for (let i = result.rg[0]; i <= result.rg[1]; i++) updated.delete(i)
    updated.set(result.sn, text)
  }
  return updated
}

/**
 * 创建讯飞 Spark IAT 流式识别会话。
 *
 * @param lang      识别语言
 * @param onResult  收到最终识别文本时回调
 * @param onError   发生错误时回调
 */
export function createXunfeiSttSession(
  lang: SttLanguage,
  onResult: (text: string) => void,
  onError: (msg: string) => void,
): SttStreamSession {
  const APP_ID = process.env.XUNFEI_APP_ID!
  const iatWs = new WebSocket(buildWsAuthUrl('iat.cn-huabei-1.xf-yun.com', '/v1'))

  // V2.0 要求每一帧都携带 parameter.iat（官方 demo 如此），只在首帧传会导致行为不一致
  const iatParams = {
    domain: 'spark_asr_v2', language: 'zh_cn', accent: 'mandarin',
    eos: 5000, dwa: 'wpgs',
    ...(lang === 'en_us' ? { ltc: 3 } : {}),
    result: { encoding: 'utf8', compress: 'raw', format: 'json' },
  }

  let resultBuf = new Map<number, string>()
  let seq = 0
  let firstSent = false
  let finished = false
  const pending: Buffer[] = []

  // terminate() 在 TCP 握手完成前（_socket 未赋值）也会抛出
  const terminateIat = () => {
    try { iatWs.terminate() } catch { /* ignore */ }
  }

  const sendChunk = (chunk: Buffer) => {
    if (iatWs.readyState !== WebSocket.OPEN) { pending.push(chunk); return }
    seq++
    const msg = firstSent
      ? {
          header: { app_id: APP_ID, status: 1 },
          parameter: { iat: iatParams },
          payload: { audio: { encoding: 'raw', sample_rate: 16000, channels: 1, bit_depth: 16, seq, status: 1, audio: chunk.toString('base64') } },
        }
      : {
          header: { app_id: APP_ID, status: 0 },
          parameter: { iat: iatParams },
          payload: { audio: { encoding: 'raw', sample_rate: 16000, channels: 1, bit_depth: 16, seq, status: 0, audio: chunk.toString('base64') } },
        }
    firstSent = true
    iatWs.send(JSON.stringify(msg))
  }

  iatWs.on('open', () => {
    for (const chunk of pending) sendChunk(chunk)
    pending.length = 0
  })

  iatWs.on('message', (raw: WebSocket.RawData) => {
    const msg = JSON.parse(raw.toString()) as {
      header: { code: number; message: string; status: number }
      payload?: { result?: { text: string } }
    }
    if (msg.header.code !== 0) {
      finished = true
      onError(`识别服务错误 ${msg.header.code}: ${msg.header.message}`)
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
      onResult(text)
    }
  })

  iatWs.on('error', (err) => {
    if ((err as NodeJS.ErrnoException).message?.includes('closed before the connection was established')) return
    if (!finished) { finished = true; onError('识别服务连接异常') }
  })

  return {
    sendAudio(chunk: Buffer) {
      if (!finished) sendChunk(chunk)
    },
    end() {
      if (finished) return
      if (!firstSent) {
        // 没有音频（用户极快松手）
        finished = true
        onResult('')
        terminateIat()
        return
      }
      // 发送结束帧
      seq++
      iatWs.send(JSON.stringify({
        header: { app_id: APP_ID, status: 2 },
        parameter: { iat: iatParams },
        payload: { audio: { encoding: 'raw', sample_rate: 16000, channels: 1, bit_depth: 16, seq, status: 2, audio: '' } },
      }))
    },
    close() {
      if (!finished) { finished = true; terminateIat() }
    },
  }
}