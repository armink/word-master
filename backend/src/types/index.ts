export type ItemType = 'word' | 'phrase'
export type QuizType = 'en_to_zh' | 'zh_to_en' | 'spelling'
export type QuizStatus = 'in_progress' | 'passed' | 'abandoned'
export type PlanStatus = 'active' | 'paused' | 'completed'

export interface StudentRow {
  id: number
  name: string
  created_at: number
}

export interface WordbookRow {
  id: number
  name: string
  description: string | null
  created_at: number
}

export interface ItemRow {
  id: number
  type: ItemType
  english: string
  chinese: string
  phonetic: string | null
  example_en: string | null
  example_zh: string | null
  created_at: number
}

export interface WordbookItemRow {
  id: number
  wordbook_id: number
  item_id: number
  sort_order: number
}

export interface StudentMasteryRow {
  id: number
  student_id: number
  item_id: number
  en_to_zh_level: number
  zh_to_en_level: number
  spelling_level: number | null
  last_reviewed_at: number | null
  updated_at: number
  // 计划模式扩展
  introduced_date: number   // YYYYMMDD, 0 = 未引入
  en_to_zh_stage: number    // 0-5, 0 = 未解锁
  zh_to_en_stage: number
  spelling_stage: number
  en_to_zh_next: number     // YYYYMMDD 下次复习, 0 = 未解锁
  zh_to_en_next: number
  spelling_next: number
}

export interface StudyPlanRow {
  id: number
  student_id: number
  wordbook_id: number
  daily_new: number
  start_date: number        // YYYYMMDD
  status: PlanStatus
  created_at: number
  updated_at: number
}

/** 今日任务中的单个词条（带本次测验类型） */
export interface TodayTaskItem {
  item_id: number
  quiz_type: QuizType
  is_new: boolean           // true = 今日新词, false = 到期复习
}

/** GET /api/tasks/today 响应 */
export interface TodayTask {
  plan: StudyPlanRow
  review_count: number
  new_count: number
  remaining_new: number     // 单词本中还未引入的词数
  today_introduced: number  // 今日已引入（含已完成 session 答对）的词数
  in_progress_answered: number  // 当前 in_progress session 中已答对词数（中途退出场景）
  items: TodayTaskItem[]    // 已按复习在前、新词在后排序
}

/** session_items 表行 */
export interface SessionItemRow {
  id: number
  session_id: number
  item_id: number
  quiz_type: QuizType
  sort_order: number
}

export interface QuizSessionRow {
  id: number
  student_id: number
  wordbook_id: number
  quiz_type: QuizType
  status: QuizStatus
  total_words: number
  pass_accuracy: number
  final_accuracy: number | null
  duration_seconds: number | null
  started_at: number
  finished_at: number | null
}

export interface QuizAnswerRow {
  id: number
  session_id: number
  item_id: number
  attempt: number
  user_answer: string
  is_correct: 0 | 1
  duration_ms: number
  answered_at: number
}

export interface WordbookWithCount extends WordbookRow {
  item_count: number
}

export interface QuizResult {
  session_id: number
  quiz_type: QuizType
  total_words: number
  correct_count: number
  final_accuracy: number
  duration_seconds: number
  passed: boolean
}
