import WebSocket from 'ws'
import { buildWsAuthUrl } from './auth'

/**
 * 讯飞在线语音合成 v2（WebSocket API）
 * 文档：https://www.xfyun.cn/doc/tts/online_tts/API.html
 *
 * 默认发音人：
 *   英文 → aisxping（标准英文男声）
 *   中文 → xiaoyan（小燕，标准女声）
 *
 * 注：超拟人接口（super smart-tts）需单独授权，暂用此标准接口。
 */
export async function synthesize(
  text: string,
  vcn = 'aisxping',
): Promise<Buffer> {
  const APP_ID = process.env.XUNFEI_APP_ID!
  const url = buildWsAuthUrl('tts-api.xfyun.cn', '/v2/tts')

  return new Promise<Buffer>((resolve, reject) => {
    const ws = new WebSocket(url)
    const chunks: Buffer[] = []

    ws.on('open', () => {
      ws.send(JSON.stringify({
        common: { app_id: APP_ID },
        business: {
          aue: 'lame',
          auf: 'audio/L16;rate=16000',
          vcn,
          speed: 50,
          volume: 50,
          pitch: 50,
          tte: 'utf8',
        },
        data: {
          status: 2,
          text: Buffer.from(text).toString('base64'),
        },
      }))
    })

    ws.on('message', (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          code: number
          message: string
          data?: { audio?: string; status?: number }
        }
        if (msg.code !== 0) {
          ws.close()
          reject(new Error(`Xunfei TTS: code=${msg.code}, msg=${msg.message}`))
          return
        }
        if (msg.data?.audio) {
          chunks.push(Buffer.from(msg.data.audio, 'base64'))
        }
        if (msg.data?.status === 2) {
          ws.close()
          resolve(Buffer.concat(chunks))
        }
      } catch (e) {
        ws.close()
        reject(e)
      }
    })

    ws.on('error', reject)

    const timer = setTimeout(() => {
      ws.close()
      reject(new Error('Xunfei TTS timeout'))
    }, 30000)
    ws.on('close', () => clearTimeout(timer))
  })
}
