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

dotenv.config()

const app = express()
const PORT = process.env.PORT ?? 3000

app.use(cors({ origin: 'http://localhost:5173' }))
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

app.listen(PORT, () => {
  console.log(`后端服务运行在 http://localhost:${PORT}`)
})

export default app
