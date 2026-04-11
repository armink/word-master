/**
 * 清除所有学习数据，保留单词本和词条
 * 运行：npx tsx scripts/clear-learning-data.ts
 */
import Database from 'better-sqlite3'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'data', 'word-test.db')
const db = new Database(DB_PATH)
db.pragma('foreign_keys = OFF')

db.transaction(() => {
  db.exec('DELETE FROM quiz_answers')
  db.exec('DELETE FROM session_items')
  db.exec('DELETE FROM quiz_sessions')
  db.exec('DELETE FROM student_mastery')
  db.exec('DELETE FROM study_plans')
  db.exec('DELETE FROM pet_status')
})()

db.pragma('foreign_keys = ON')

const tables = ['quiz_answers', 'session_items', 'quiz_sessions', 'student_mastery', 'study_plans', 'pet_status']
for (const t of tables) {
  const { c } = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }
  console.log(`  ${t}: ${c} 条`)
}
console.log('\n✅ 学习数据已清除，单词本和词条保留')
db.close()
