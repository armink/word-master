import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { initSchema } from './db/schema'
import studentsRouter from './routes/students'
import wordbooksRouter from './routes/wordbooks'
import quizRouter from './routes/quiz'
import recordsRouter from './routes/records'
import ttsRouter from './routes/tts'
import sttRouter from './routes/stt'
import semanticRouter from './routes/semantic'
import plansRouter from './routes/plans'
import tasksRouter from './routes/tasks'
import petRouter from './routes/pet'

dotenv.config()

const app = express()

app.use(cors({
  origin: (origin, cb) => {
    const extra = process.env.CORS_ORIGIN
    if (
      !origin ||
      (extra && origin === extra) ||
      /^https?:\/\/(localhost|127\.0\.0\.1|\d+\.\d+\.\d+\.\d+):5173$/.test(origin)
    ) {
      cb(null, true)
    } else {
      cb(new Error('Not allowed by CORS'))
    }
  },
}))
app.use(express.json())

// 初始化数据库表结构
initSchema()

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() })
})

app.use('/api/students', studentsRouter)
app.use('/api/wordbooks', wordbooksRouter)
app.use('/api/quiz', quizRouter)
app.use('/api/records', recordsRouter)
app.use('/api/tts', ttsRouter)
app.use('/api/stt', sttRouter)
app.use('/api/semantic', semanticRouter)
app.use('/api/plans', plansRouter)
app.use('/api/tasks', tasksRouter)
app.use('/api/pet', petRouter)

// 生产模式：托管前端构建产物，所有非 /api 请求返回 index.html（SPA fallback）
if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.resolve(__dirname, '../frontend-dist')
  // 支持子路径部署，与 Vite VITE_BASE_URL 保持一致，默认 /
  const basePath = (process.env.VITE_BASE_URL || '/').replace(/\/+$/, '') || ''
  app.use(basePath, express.static(frontendDist))
  app.get(`${basePath}/*`, (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'))
  })
}

export default app
