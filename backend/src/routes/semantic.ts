import { Router } from 'express'
import { checkSemanticMatch, isSemanticModelReady } from '../services/semantic'
import { matchEnglishAnswer } from '../utils/english-match'

const router = Router()

/** GET /api/semantic/status — 查看模型是否已加载 */
router.get('/status', (_req, res) => {
  res.json({ ready: isSemanticModelReady() })
})

/**
 * POST /api/semantic/check-chinese
 * 英→中：校验用户输入的中文答案（三阶段语义匹配）
 * Body: { standard: string, answer: string }
 * Response: { match: boolean, score: number, method: string }
 */
router.post('/check-chinese', async (req, res) => {
  const { standard, answer } = req.body as { standard?: string; answer?: string }

  if (!standard || typeof standard !== 'string') {
    res.status(400).json({ error: 'standard is required' })
    return
  }
  if (!answer || typeof answer !== 'string') {
    res.status(400).json({ error: 'answer is required' })
    return
  }

  try {
    const result = await checkSemanticMatch(standard.trim(), answer.trim())
    res.json(result)
  } catch (err) {
    console.error('[semantic] 检查失败:', err)
    res.status(500).json({ error: '语义服务暂时不可用' })
  }
})

/**
 * POST /api/semantic/check-english
 * 中→英 / 拼写：校验用户输入的英文答案（缩写展开 + 斜杠备选）
 * Body: { standard: string, answer: string }
 * Response: { match: boolean }
 */
router.post('/check-english', (req, res) => {
  const { standard, answer } = req.body as { standard?: string; answer?: string }

  if (!standard || typeof standard !== 'string') {
    res.status(400).json({ error: 'standard is required' })
    return
  }
  if (answer === undefined || answer === null || typeof answer !== 'string') {
    res.status(400).json({ error: 'answer is required' })
    return
  }

  const match = matchEnglishAnswer(standard.trim(), answer.trim())
  res.json({ match })
})

export default router
