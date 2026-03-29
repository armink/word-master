import { buildAuthUrl } from './auth'

export async function synthesize(text: string, vcn = 'xiaoyan'): Promise<Buffer> {
  // 在函数调用时读取，确保 dotenv.config() 已执行
  const APP_ID = process.env.XUNFEI_APP_ID!
  const url = buildAuthUrl('tts-api.xfyun.cn', '/v2/tts')
  const body = {
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
  }

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('audio') || contentType.includes('mpeg')) {
    return Buffer.from(await res.arrayBuffer())
  }

  const errBody = await res.json() as { code: number; message: string }
  throw new Error(`Xunfei TTS: code=${errBody.code}, msg=${errBody.message}`)
}
