import { Router } from 'express'
import { synthesize } from '../services/xunfei/tts'

const router = Router()

router.post('/', async (req, res) => {
  const { text, vcn } = req.body as { text?: string; vcn?: string }
  if (!text?.trim()) {
    res.status(400).json({ error: 'text 不能为空' })
    return
  }
  try {
    const audio = await synthesize(text.trim(), vcn)
    res.set('Content-Type', 'audio/mpeg')
    res.send(audio)
  } catch (e) {
    console.error('TTS error:', e)
    res.status(500).json({ error: (e as Error).message })
  }
})

export default router
