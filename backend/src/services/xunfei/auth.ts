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
  // 使用 encodeURIComponent 确保 date 中的空格编码为 %20 而非 +
  const url = new URL(`https://${host}${path}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${encodeURIComponent(host)}`)
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
  // 使用 encodeURIComponent 确保 date 中的空格编码为 %20 而非 +
  // URLSearchParams 会将空格编码为 +，讯飞服务端不会还原导致签名验证失败
  return `wss://${host}${path}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${encodeURIComponent(host)}`
}
