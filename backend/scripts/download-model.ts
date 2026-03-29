/**
 * 模型预下载脚本
 * 用途：在网络条件好的时候提前下载并缓存 MiniLM 语义模型（约 45MB ONNX int8 量化版）
 * 运行方式：
 *   cd backend
 *   npx tsx scripts/download-model.ts
 *
 * 若 hf-mirror.com 不可达，可设置环境变量使用其他镜像或代理：
 *   HF_MIRROR=https://hf-mirror.com npx tsx scripts/download-model.ts
 *   HTTPS_PROXY=http://127.0.0.1:7890 npx tsx scripts/download-model.ts
 */

import { pipeline, env } from '@xenova/transformers'

const mirror = process.env.HF_MIRROR ?? 'https://hf-mirror.com'
env.remoteHost = mirror

async function main() {
  console.log(`[download] 使用镜像: ${mirror}`)
  console.log('[download] 开始下载 paraphrase-multilingual-MiniLM-L12-v2 (ONNX int8)…')
  console.log('[download] 模型文件约 45MB，首次下载请耐心等待\n')

  const start = Date.now()
  try {
    await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2')
    console.log(`\n[download] ✅ 下载完成，耗时 ${((Date.now() - start) / 1000).toFixed(1)}s`)
    console.log('[download] 模型已缓存，重启后端即可享受语义匹配功能')
  } catch (err) {
    console.error('\n[download] ❌ 下载失败:', (err as Error).message)
    console.log('\n解决方案：')
    console.log('  1. 若有代理，运行: $env:HTTPS_PROXY="http://127.0.0.1:7890"; npx tsx scripts/download-model.ts')
    console.log('  2. 若 hf-mirror.com 不可达，尝试: $env:HF_MIRROR="https://huggingface.co"; npx tsx scripts/download-model.ts')
    console.log('  3. 无法下载时，应用会自动降级为关键词匹配，不影响正常使用')
    process.exit(1)
  }
}

main()
