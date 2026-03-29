import WebSocket from 'ws'
import { buildWsAuthUrl } from './auth'

const APP_ID = process.env.XUNFEI_APP_ID!

type SttLanguage = 'zh_cn' | 'en_us'

interface IatResultWord {
  cw: Array<{ w: string; sc: number }>
  bg: number
}

interface IatResult {
  sn: number
  pgs: 'apd' | 'rpl'
  rg?: [number, number]
  ws: IatResultWord[]
}

function mergeResult(buf: Map<number, string>, result: IatResult): Map<number, string> {
  const text = result.ws.map(w => w.cw[0]?.w ?? '').join('')
  const updated = new Map(buf)
  if (result.pgs === 'apd') {
    updated.set(result.sn, text)
  } else if (result.pgs === 'rpl' && result.rg) {
    for (let i = result.rg[0]; i <= result.rg[1]; i++) updated.delete(i)
    updated.set(result.sn, text)
  }
  return updated
}

export function recognize(audioBuffer: Buffer, language: SttLanguage = 'zh_cn'): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = buildWsAuthUrl('iat-api.xfyun.cn', '/v2/iat')
    const ws = new WebSocket(url)
    let resultBuf = new Map<number, string>()
    let timer: ReturnType<typeof setTimeout> | null = null

    ws.on('open', () => {
      const CHUNK = 1280  // 40ms of 16kHz 16-bit mono PCM
      let offset = 0

      const sendNext = () => {
        if (offset >= audioBuffer.length) {
          ws.send(JSON.stringify({
            data: { status: 2, format: 'audio/L16;rate=16000', encoding: 'raw', audio: '' },
          }))
          return
        }

        const chunk = audioBuffer.subarray(offset, offset + CHUNK)
        const isFirst = offset === 0

        const msg = isFirst
          ? {
              common: { app_id: APP_ID },
              business: {
                language,
                domain: 'iat',
                accent: 'mandarin',
                vad_eos: 5000,
                nunum: 0,
                ptt: 0,
              },
              data: {
                status: 0,
                format: 'audio/L16;rate=16000',
                encoding: 'raw',
                audio: chunk.toString('base64'),
              },
            }
          : {
              data: {
                status: 1,
                format: 'audio/L16;rate=16000',
                encoding: 'raw',
                audio: chunk.toString('base64'),
              },
            }

        ws.send(JSON.stringify(msg))
        offset += CHUNK
        timer = setTimeout(sendNext, 40)
      }

      sendNext()
    })

    ws.on('message', (raw: WebSocket.RawData) => {
      const msg = JSON.parse(raw.toString()) as {
        code: number
        message: string
        data?: { result: IatResult; status: number }
      }

      if (msg.code !== 0) {
        ws.close()
        reject(new Error(`Xunfei STT error ${msg.code}: ${msg.message}`))
        return
      }

      if (msg.data?.result) {
        resultBuf = mergeResult(resultBuf, msg.data.result)
      }

      if (msg.data?.status === 2) {
        ws.close()
        const text = [...resultBuf.entries()]
          .sort(([a], [b]) => a - b)
          .map(([, v]) => v)
          .join('')
        resolve(text)
      }
    })

    ws.on('error', (err) => {
      if (timer) clearTimeout(timer)
      reject(err)
    })

    ws.on('close', () => {
      if (timer) clearTimeout(timer)
    })
  })
}
