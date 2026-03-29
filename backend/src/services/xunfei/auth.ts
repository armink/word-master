import crypto from 'crypto'

export function buildAuthUrl(host: string, path: string): URL {
  const date = new Date().toUTCString()
  const signStr = `host: ${host}\ndate: ${date}\nPOST ${path} HTTP/1.1`
  const signature = crypto
    .createHmac('sha256', process.env.XUNFEI_API_SECRET!)
    .update(signStr)
    .digest('base64')
  const authStr = `api_key="${process.env.XUNFEI_API_KEY!}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`
  const authorization = Buffer.from(authStr).toString('base64')
  const url = new URL(`https://${host}${path}`)
  url.searchParams.set('authorization', authorization)
  url.searchParams.set('date', date)
  url.searchParams.set('host', host)
  return url
}

export function buildWsAuthUrl(host: string, path: string): string {
  const date = new Date().toUTCString()
  const signStr = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`
  const signature = crypto
    .createHmac('sha256', process.env.XUNFEI_API_SECRET!)
    .update(signStr)
    .digest('base64')
  const authStr = `api_key="${process.env.XUNFEI_API_KEY!}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`
  const authorization = Buffer.from(authStr).toString('base64')
  const params = new URLSearchParams({ authorization, date, host })
  return `wss://${host}${path}?${params.toString()}`
}
