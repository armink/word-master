export type ItemType = 'word' | 'phrase'
export type QuizType = 'en_to_zh' | 'zh_to_en' | 'spelling'
export type QuizStatus = 'in_progress' | 'passed' | 'abandoned'

export interface Student {
  id: number
  name: string
  created_at: number
}

export interface Wordbook {
  id: number
  name: string
  description: string | null
  created_at: number
  item_count: number
}

export interface Item {
  id: number
  type: ItemType
  english: string
  chinese: string
  phonetic: string | null
  example_en: string | null
  example_zh: string | null
  created_at: number
  sort_order?: number
}

export interface WordbookDetail {
  id: number
  name: string
  description: string | null
  created_at: number
  items: Item[]
}

export interface QuizSession {
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

export interface QuizSessionDetail extends QuizSession {
  items: (Item & { item_quiz_type?: QuizType; sort_order?: number })[]
}

export interface QuizAnswer {
  id: number
  session_id: number
  item_id: number
  attempt: number
  user_answer: string
  is_correct: 0 | 1
  duration_ms: number
  answered_at: number
}

export interface QuizFinishResult {
  session_id: number
  quiz_type: QuizType
  total_words: number
  correct_count: number
  final_accuracy: number
  duration_seconds: number
  passed: boolean
  session: QuizSession
}

export interface ItemWithMastery extends Item {
  en_to_zh_level: number
  zh_to_en_level: number
  spelling_level: number | null
  last_reviewed_at: number | null
}

// ── 艾宾浩斯学习计划 ─────────────────────────────────────────────

export type PlanStatus = 'active' | 'paused' | 'completed'

export interface StudyPlan {
  id: number
  student_id: number
  wordbook_id: number
  daily_new: number
  start_date: number
  status: PlanStatus
  created_at: number
  updated_at: number
}

export interface TodayTaskItem {
  item_id: number
  quiz_type: QuizType
  is_new: boolean
}

export interface TodayTask {
  plan: StudyPlan
  review_count: number
  new_count: number
  remaining_new: number
  items: TodayTaskItem[]
}

export interface PlanSessionDetail {
  session: QuizSession
  items: (Item & { item_quiz_type: QuizType; sort_order: number })[]
}

export interface WordbookStats {
  total_items: number
  introduced: number
  today_new: number
  zh_to_en_active: number
  spelling_active: number
  today_correct: number
}
