import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'word-test.db')

// 确保 data 目录存在
const dataDir = path.dirname(DB_PATH)
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const db = new Database(DB_PATH)

// 开启 WAL 模式提升并发性能
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

export default db
