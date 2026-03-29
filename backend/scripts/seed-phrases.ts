/**
 * 从 PDF 解析高频短语并按周导入单词本
 *
 * 运行（在 backend/ 目录下）：
 *   npx tsx scripts/seed-phrases.ts
 *
 * 会创建 5 个单词本："高频短语·第一周" ~ "高频短语·第五周"
 * 若单词本已存在则跳过（幂等）。
 */
import { execSync } from 'child_process'
import path from 'path'
import db from '../src/db/client'

// ─── 配置 ────────────────────────────────────────────────────────
const PDF_PATH = path.resolve(__dirname, '../../高频短语1-5(1).pdf')

const WEEK_HEADERS = ['First Week', 'Second Week', 'Third Week', 'Fourth Week', 'Fifth Week']
const WEEK_NAMES = ['高频短语·第一周', '高频短语·第二周', '高频短语·第三周', '高频短语·第四周', '高频短语·第五周']

// ─── PDF 文本提取 ─────────────────────────────────────────────────
console.log('正在解析 PDF...')
let raw: string
try {
  raw = execSync(`npx pdf-parse text "${PDF_PATH}"`, {
    cwd: path.dirname(PDF_PATH),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore'],   // 静默 stderr
  })
} catch (e: any) {
  // pdf-parse 有时在成功后仍以非 0 退出，取 stdout
  raw = e.stdout ?? ''
  if (!raw) { console.error('PDF 解析失败', e.message); process.exit(1) }
}

// ─── 行解析 ──────────────────────────────────────────────────────
function splitEntry(line: string): [string, string] | null {
  // 去掉行首编号 "N. "
  const stripped = line.replace(/^\d+\.\s*/, '')
  if (!stripped) return null

  // 优先：以连续 2 个以上空白为分隔，取第一处
  let idx = stripped.search(/[ \t]{2,}/)

  // 回退：以第一个 CJK 字符（包含全角标点）为分隔
  if (idx === -1) {
    idx = stripped.search(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\u2026]/)
  }
  if (idx === -1) return null

  const english = stripped.slice(0, idx).trim()
  const chinese = stripped.slice(idx).trim().replace(/[ \t]+/g, ' ')

  if (!english || !chinese) return null
  return [english, chinese]
}

// weekItems[i] 存放第 i 周的条目
const weekItems: Array<[string, string]>[] = WEEK_NAMES.map(() => [])
let currentWeekIdx = -1

for (const raw_line of raw.split('\n')) {
  const line = raw_line.trim()
  if (!line) continue
  // 跳过页码标记 "-- 1 of 10 --"
  if (/^--\s*\d+\s*of\s*\d+\s*--$/.test(line)) continue

  const weekIdx = WEEK_HEADERS.indexOf(line)
  if (weekIdx !== -1) { currentWeekIdx = weekIdx; continue }
  if (currentWeekIdx === -1) continue
  if (!/^\d+\./.test(line)) continue

  const entry = splitEntry(line)
  if (entry) weekItems[currentWeekIdx].push(entry)
}

// ─── 验证解析结果 ─────────────────────────────────────────────────
const total = weekItems.reduce((s, w) => s + w.length, 0)
console.log(`解析完成，共 ${total} 条（预期 413）`)
weekItems.forEach((w, i) => console.log(`  ${WEEK_NAMES[i]}: ${w.length} 条`))
if (total < 400) { console.error('解析条数过少，请检查 PDF 路径或格式'); process.exit(1) }

// ─── 写入数据库 ───────────────────────────────────────────────────
const insertAll = db.transaction(() => {
  for (let i = 0; i < WEEK_NAMES.length; i++) {
    const name = WEEK_NAMES[i]

    // 幂等：已存在则跳过
    const existing = db.prepare('SELECT id FROM wordbooks WHERE name = ?').get(name)
    if (existing) { console.log(`已存在，跳过：${name}`); continue }

    const wbResult = db.prepare(
      'INSERT INTO wordbooks (name, description) VALUES (?, ?)'
    ).run(name, `初中英语高频短语（第 ${i + 1} 周）`)
    const wbId = wbResult.lastInsertRowid

    let order = 0
    for (const [english, chinese] of weekItems[i]) {
      const type = english.includes(' ') ? 'phrase' : 'word'
      const itemResult = db.prepare(
        'INSERT INTO items (type, english, chinese) VALUES (?, ?, ?)'
      ).run(type, english, chinese)

      db.prepare(
        'INSERT OR IGNORE INTO wordbook_items (wordbook_id, item_id, sort_order) VALUES (?, ?, ?)'
      ).run(wbId, itemResult.lastInsertRowid, order++)
    }

    console.log(`✅ 导入 ${name}（${weekItems[i].length} 条）`)
  }
})

insertAll()
console.log('\n全部完成！')
