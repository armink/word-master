import { Router } from 'express'
import express from 'express'
import { recognize } from '../services/xunfei/stt'

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
