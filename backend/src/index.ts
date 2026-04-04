import app from './app'
import { warmupSemantic } from './services/semantic'

const PORT = Number(process.env.PORT ?? 3000)

app.listen(PORT, '0.0.0.0', () => {
  console.log(`后端服务运行在 http://0.0.0.0:${PORT}`)
  // 后台预热语义模型，首个请求前完成加载
  warmupSemantic()
})

export default app
