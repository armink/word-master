import WebSocket from 'ws'
import { buildWsAuthUrl } from './auth'

// Spark IAT (中文识别大模型) 接口：iat.xf-yun.com/v1
// 支持中英文及202种方言自动识别，language 固定 zh_cn
// lang='en_us' 时设置 ltc=3 只输出英文字符
type SttLanguage = 'zh_cn' | 'en_us'

interface IatResultText {
  sn: number
  pgs?: 'apd' | 'rpl'
  rg?: [number, number]
  ws: Array<{ bg: number; cw: Array<{ w: string }> }>
  ls?: boolean
}

function mergeResult(buf: Map<number, string>, result: IatResultText): Map<number, string> {
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

export function recognize(audioBuffer: Buffer, language: SttLanguage = 'zh_cn'): Promise<string> {
  // 在函数调用时读取，确保 dotenv.config() 已执行
  const APP_ID = process.env.XUNFEI_APP_ID!
  return new Promise((resolve, reject) => {
    // Spark 中英识别大模型接口地址
    const url = buildWsAuthUrl('iat.xf-yun.com', '/v1')
    const ws = new WebSocket(url)
    let resultBuf = new Map<number, string>()
    let timer: ReturnType<typeof setTimeout> | null = null
    let seq = 0

    ws.on('open', () => {
      const CHUNK = 1280  // 40ms of 16kHz 16-bit mono PCM
      let offset = 0

      const sendNext = () => {
        if (offset >= audioBuffer.length) {
          // 最后一帧
          seq++
          ws.send(JSON.stringify({
            header: { app_id: APP_ID, status: 2 },
            payload: {
              audio: {
                encoding: 'raw', sample_rate: 16000, channels: 1, bit_depth: 16,
                seq, status: 2, audio: '',
              },
            },
          }))
          return
        }

        const chunk = audioBuffer.subarray(offset, offset + CHUNK)
        const isFirst = offset === 0
        seq++

        const msg = isFirst
          ? {
              header: { app_id: APP_ID, status: 0 },
              parameter: {
                iat: {
                  domain: 'slm',
                  language: 'zh_cn',  // Spark IAT 固定 zh_cn，自动识别中英文
                  accent: 'mandarin',
                  eos: 5000,
                  dwa: 'wpgs',
                  ptt: 0,
                  // 英文输入时只输出英文字符，避免返回拼音误识别
                  ...(language === 'en_us' ? { ltc: 3 } : {}),
                  result: { encoding: 'utf8', compress: 'raw', format: 'json' },
                },
              },
              payload: {
                audio: {
                  encoding: 'raw', sample_rate: 16000, channels: 1, bit_depth: 16,
                  seq, status: 0, audio: chunk.toString('base64'),
                },
              },
            }
          : {
              header: { app_id: APP_ID, status: 1 },
              payload: {
                audio: {
                  encoding: 'raw', sample_rate: 16000, channels: 1, bit_depth: 16,
                  seq, status: 1, audio: chunk.toString('base64'),
                },
              },
            }

        ws.send(JSON.stringify(msg))
        offset += CHUNK
        // 已录完的音频无需模拟实时速率，直接全速发送以减少延迟
        timer = setTimeout(sendNext, 0)
      }

      sendNext()
    })

    ws.on('message', (raw: WebSocket.RawData) => {
      const msg = JSON.parse(raw.toString()) as {
        header: { code: number; message: string; status: number }
        payload?: { result?: { text: string; status: number } }
      }

      if (msg.header.code !== 0) {
        ws.close()
        reject(new Error(`Xunfei Spark IAT error ${msg.header.code}: ${msg.header.message}`))
        return
      }

      if (msg.payload?.result?.text) {
        // text 字段是 base64 编码的 JSON 字符串
        try {
          const decoded = Buffer.from(msg.payload.result.text, 'base64').toString('utf8')
          const result = JSON.parse(decoded) as IatResultText
          resultBuf = mergeResult(resultBuf, result)
        } catch {
          // 忽略解析异常
        }
      }

      if (msg.header.status === 2) {
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
