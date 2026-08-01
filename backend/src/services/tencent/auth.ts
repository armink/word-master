/**
 * 腾讯云语音识别 HMAC-SHA1 签名
 *
 * 文档：https://cloud.tencent.com/document/product/1093/48982
 * 对除 signature 外的所有参数按字典序排序后签名
 */

import crypto from 'crypto'

interface SignParams {
  appId: string
  secretId: string
  secretKey: string
  engineModelType: string
  voiceId: string
  /** 签名有效期秒数，默认 24 小时 */
  expiredSeconds?: number
}

export function buildWsUrl(params: SignParams): string {
  const {
    appId, secretId, secretKey,
    engineModelType, voiceId,
    expiredSeconds = 86400,
  } = params

  const timestamp = Math.floor(Date.now() / 1000)
  const expired = timestamp + expiredSeconds
  const nonce = Math.floor(Math.random() * 1e10)

  // 除 signature 外的所有参数，按字典序排序
  const queryParams = new URLSearchParams({
    engine_model_type: engineModelType,
    expired: String(expired),
    nonce: String(nonce),
    secretid: secretId,
    timestamp: String(timestamp),
    voice_format: '1',   // 1=pcm
    voice_id: voiceId,
  })

  // 按 key 排序重建 query string（URLSearchParams 不保证顺序）
  const sorted = [...queryParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
  const sortedQs = sorted.map(([k, v]) => `${k}=${v}`).join('&')

  // 签名原文：asr.cloud.tencent.com/asr/v2/<appid>?<sortedQs>
  const signStr = `asr.cloud.tencent.com/asr/v2/${appId}?${sortedQs}`

  const signature = crypto
    .createHmac('sha1', secretKey)
    .update(signStr)
    .digest('base64')

  // URL 编码 signature
  const encodedSig = encodeURIComponent(signature)

  return `wss://asr.cloud.tencent.com/asr/v2/${appId}?${sortedQs}&signature=${encodedSig}`
}

/** 生成 UUID v4 */
export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
