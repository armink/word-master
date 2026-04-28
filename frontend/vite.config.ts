import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import path from 'path'

export default defineConfig(({ mode }) => {
  // 正确读取 frontend/.env* 文件中的变量（process.env 在 config 文件中不会自动加载 .env）
  const env = loadEnv(mode, process.cwd(), '')
  // 优先读取 frontend/.env* 文件中的 VITE_BASE_URL
  // 其次读取 process.env（CI 或 Dockerfile ARG 传入）
  // 子路径部署示例：/word-master/，默认根路径 /
  const base = env.VITE_BASE_URL || process.env.VITE_BASE_URL || '/'

  return {
    base,
    plugins: [react(), basicSsl()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          ws: true,
        },
      },
    },
  }
})
