import http from 'http'
import { WebSocketServer } from 'ws'
import app from './app'
import { warmupSemantic } from './services/semantic'
import { handleSttStream } from './routes/stt'

const PORT = Number(process.env.PORT ?? 3000)

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
