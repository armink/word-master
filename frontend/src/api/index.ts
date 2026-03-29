import type {
  Student, Wordbook, WordbookDetail,
  QuizSessionDetail, QuizAnswer, QuizFinishResult,
  ItemWithMastery, QuizType,
} from '@/types'

const BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ---- Students ----
export const getStudents = () =>
  request<Student[]>('/students')

export const createStudent = (name: string) =>
  request<Student>('/students', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })

// ---- Wordbooks ----
export const getWordbooks = () =>
  request<Wordbook[]>('/wordbooks')

export const createWordbook = (name: string, description?: string) =>
  request<Wordbook>('/wordbooks', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  })

export const getWordbookDetail = (id: number) =>
  request<WordbookDetail>(`/wordbooks/${id}`)

export const importWords = (id: number, text: string) =>
  request<{ success: boolean; imported: number; skipped: number }>(
    `/wordbooks/${id}/import`,
    { method: 'POST', body: JSON.stringify({ text }) }
  )

// ---- Quiz ----
export const createQuizSession = (
  student_id: number,
  wordbook_id: number,
  quiz_type: QuizType,
) =>
  request<QuizSessionDetail>('/quiz/sessions', {
    method: 'POST',
    body: JSON.stringify({ student_id, wordbook_id, quiz_type }),
  })

export const getQuizSession = (id: number) =>
  request<QuizSessionDetail>(`/quiz/sessions/${id}`)

export const submitAnswer = (
  sessionId: number,
  data: { item_id: number; user_answer: string; is_correct: boolean; duration_ms: number },
) =>
  request<QuizAnswer>(`/quiz/sessions/${sessionId}/answers`, {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const finishSession = (sessionId: number) =>
  request<QuizFinishResult>(`/quiz/sessions/${sessionId}/finish`, {
    method: 'POST',
  })

// ---- Records ----
export const getRecords = (student_id: number, wordbook_id?: number) => {
  const qs = wordbook_id
    ? `?student_id=${student_id}&wordbook_id=${wordbook_id}`
    : `?student_id=${student_id}`
  return request<ItemWithMastery[]>(`/records${qs}`)
}
