import http from 'http'
import { WebSocketServer } from 'ws'
import app from './app'
import { warmupSemantic, setLlmVerifier } from './services/semantic'
import { verifyChineseSemanticMatch } from './services/deepseek'
import { handleSttStream } from './routes/stt'

const PORT = Number(process.env.PORT ?? 3000)

// 注入 LLM 语义验证器（有 DEEPSEEK_API_KEY 时启用灰色地带 LLM 兜底）
if (process.env.DEEPSEEK_API_KEY) {
  setLlmVerifier(verifyChineseSemanticMatch)
}

const server = http.createServer(app)

// 流式 STT：将 /api/stt/stream 的 WebSocket 升级请求转交给处理器
const wss = new WebSocketServer({ noServer: true })
server.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/api/stt/stream')) {
    wss.handleUpgrade(req, socket, head, (ws) => handleSttStream(ws, req))
  } else {
    socket.destroy()
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`后端服务运行在 http://0.0.0.0:${PORT}`)
  // 后台预热语义模型，首个请求前完成加载
  warmupSemantic()
})
