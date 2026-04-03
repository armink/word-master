import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
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
import { warmupSemantic } from './services/semantic'

dotenv.config()

const app = express()
const PORT = Number(process.env.PORT ?? 3000)

app.use(cors({
  // 允许 localhost 和局域网任意 IP 访问（手机通过局域网 IP 访问前端时，
  // 请求经由 Vite proxy 转发，origin 是 Vite 服务器地址）
  origin: (origin, cb) => {
    // 允许 localhost 和局域网 IP（HTTP 和 HTTPS 均可，HTTPS 是移动端麦克风必需）
    if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1|\d+\.\d+\.\d+\.\d+):5173$/.test(origin)) {
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`后端服务运行在 http://0.0.0.0:${PORT}`)
  // 后台预热语义模型，首个请求前完成加载
  warmupSemantic()
})

export default app
