import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

// 读取 package.json 中的语义版本
function getVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'))
    return pkg.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

// 获取 git SHA：优先用 Docker 构建时写入的环境变量，其次实时执行 git 命令
function getGitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return 'unknown'
  }
}

export default defineConfig(({ mode }) => {
  // 正确读取 frontend/.env* 文件中的变量（process.env 在 config 文件中不会自动加载 .env）
  const env = loadEnv(mode, process.cwd(), '')
  // 优先读取 frontend/.env* 文件中的 VITE_BASE_URL
  // 其次读取 process.env（CI 或 Dockerfile ARG 传入）
  // 子路径部署示例：/word-master/，默认根路径 /
  const base = env.VITE_BASE_URL || process.env.VITE_BASE_URL || '/'
  // 版本信息：Docker 构建时 VITE_GIT_SHA 写入 .env，本地开发时 fallback 到 git 命令
  const gitSha = env.VITE_GIT_SHA || getGitSha()

  return {
    base,
    plugins: [react(), basicSsl()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    define: {
      __VERSION__: JSON.stringify(getVersion()),
      __GIT_SHA__: JSON.stringify(gitSha),
      __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
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
