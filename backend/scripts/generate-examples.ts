/**
 * 批量生成例句脚本（一次性运行）
 *
 * 用法：
 *   cd backend
 *   npx tsx scripts/generate-examples.ts            # 生成所有 pending 条目
 *   npx tsx scripts/generate-examples.ts --dry-run  # 只预览，不写入
 *   npx tsx scripts/generate-examples.ts --limit 20 # 只处理前 20 条（测试用）
 *
 * 特性：
 *   - 并发 3（每秒不超过 3 请求，避免触发 rate limit）
 *   - 自动重试（最多 2 次）
 *   - 失败条目输出到 scripts/failed-items.json，方便手动补录
 *   - 进度实时打印
 */

import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import Database from 'better-sqlite3'
import { generateExample } from '../src/services/deepseek'

dotenv.config({ path: path.join(__dirname, '..', '.env') })

const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, '..', 'data', 'word-test.db')
const db = new Database(DB_PATH)

// ── CLI 参数解析 ──────────────────────────────────────────────────
const args = process.argv.slice(2)
const isDryRun  = args.includes('--dry-run')
const limitArg  = args.find(a => a.startsWith('--limit=') || a === '--limit')
const limit     = limitArg
  ? parseInt(args[args.indexOf('--limit') + 1] ?? limitArg.split('=')[1], 10)
  : Infinity

const CONCURRENCY   = 3    // 同时最多 3 个并发请求
const RETRY_MAX     = 2    // 每条最多重试 2 次
const RETRY_DELAY_MS = 1500

// ── 查询待生成条目 ────────────────────────────────────────────────
interface PendingItem {
  id: number
  english: string
  chinese: string
}

const pendingItems = db.prepare(`
  SELECT id, english, chinese
  FROM items
  WHERE example_status = 'pending'
  ORDER BY id ASC
`).all() as PendingItem[]

const items = isFinite(limit) ? pendingItems.slice(0, limit) : pendingItems
const total = items.length

if (total === 0) {
  console.log('✅ 没有待生成的条目（所有条目 example_status 均为 done）')
  process.exit(0)
}

console.log(`📋 共 ${total} 条待生成${isDryRun ? '（dry-run 模式，不写入）' : ''}`)
if (!process.env.DEEPSEEK_API_KEY) {
  console.error('❌ 请在 .env 中配置 DEEPSEEK_API_KEY')
  process.exit(1)
}

// ── 写回数据库的语句 ──────────────────────────────────────────────
const updateStmt     = db.prepare(`UPDATE items SET example_en=?, example_zh=?, example_status='done' WHERE id=?`)
const markFailed     = db.prepare(`UPDATE items SET example_status='failed' WHERE id=?`)
const markGenerating = db.prepare(`UPDATE items SET example_status='generating' WHERE id=?`)

// ── 单条处理（含重试）────────────────────────────────────────────
async function processItem(item: PendingItem): Promise<'ok' | 'failed'> {
  for (let attempt = 1; attempt <= RETRY_MAX + 1; attempt++) {
    try {
      if (!isDryRun) markGenerating.run(item.id)
      const result = await generateExample(item.english, item.chinese)
      if (!isDryRun) {
        updateStmt.run(result.example_en, result.example_zh, item.id)
      } else {
        console.log(`  [dry] ${item.english}: "${result.example_en}" / "${result.example_zh}"`)
      }
      return 'ok'
    } catch (err) {
      if (attempt <= RETRY_MAX) {
        await sleep(RETRY_DELAY_MS * attempt)
      } else {
        if (!isDryRun) markFailed.run(item.id)
        return 'failed'
      }
    }
  }
  return 'failed'
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ── 并发池执行 ────────────────────────────────────────────────────
async function main() {
  let done = 0
  let failed = 0
  const failedItems: PendingItem[] = []

  // 每 DELAY_PER_REQ ms 起一个任务，维持不超过 CONCURRENCY 个并发
  const DELAY_PER_REQ = Math.ceil(1000 / CONCURRENCY) // ~333ms

  const running: Promise<void>[] = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    const task = (async () => {
      const status = await processItem(item)
      done++
      if (status === 'failed') {
        failed++
        failedItems.push(item)
        console.error(`❌ [${done}/${total}] FAIL  ${item.english}（${item.chinese}）`)
      } else {
        const pct = Math.round((done / total) * 100)
        process.stdout.write(`\r✅ [${done}/${total}] ${pct}%  ${item.english.padEnd(25)}`)
      }
    })()

    running.push(task)
    // 每隔 DELAY_PER_REQ ms 再起下一个，相当于限速
    await sleep(DELAY_PER_REQ)

    // 超过并发上限时等最早那个结束
    if (running.length >= CONCURRENCY) {
      await Promise.race(running)
      // 清理已完成的
      running.splice(0, running.findIndex(() => true))
    }
  }

  await Promise.all(running)
  console.log(`\n\n🎉 完成！成功 ${done - failed} / ${total}，失败 ${failed}`)

  if (failedItems.length > 0) {
    const outPath = path.join(__dirname, 'failed-items.json')
    fs.writeFileSync(outPath, JSON.stringify(failedItems, null, 2), 'utf-8')
    console.log(`⚠️  失败条目已保存到 ${outPath}，可修改后重新运行`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
