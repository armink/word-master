import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { initSchema } from './db/schema'

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

// 路由（后续逐步添加）
// app.use('/api/wordbooks', wordbooksRouter)
// app.use('/api/items', itemsRouter)
// app.use('/api/quiz', quizRouter)
// app.use('/api/records', recordsRouter)

app.listen(PORT, () => {
  console.log(`后端服务运行在 http://localhost:${PORT}`)
})

export default app
