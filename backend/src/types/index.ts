export type ItemType = 'word' | 'phrase'
export type QuizType = 'en_to_zh' | 'zh_to_en' | 'spelling'
export type QuizStatus = 'in_progress' | 'passed' | 'abandoned'

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
