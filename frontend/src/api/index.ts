import type {
  Student, Wordbook, WordbookDetail,
  QuizSessionDetail, QuizAnswer, QuizFinishResult,
  ItemWithMastery, QuizType,
  StudyPlan, TodayTask, PlanSessionDetail, WordbookStats,
  PetStatus, PetFeedResult,
  Forecast,
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

export const deleteWordbook = async (id: number, force = false): Promise<{ has_data?: boolean; mastery_count?: number } | null> => {
  const url = `${BASE}/wordbooks/${id}${force ? '?force=1' : ''}`
  const res = await fetch(url, { method: 'DELETE' })
  if (res.status === 204) return null
  const data = await res.json()
  if (res.status === 409 && data.has_data) return data
  throw new Error(data.error ?? '删除失败')
}

export const importWords = (id: number, text: string) =>
  request<{ success: boolean; imported: number; skipped: number }>(
    `/wordbooks/${id}/import`,
    { method: 'POST', body: JSON.stringify({ text }) }
  )

export const exportWordbook = async (id: number): Promise<string> => {
  const res = await fetch(`${BASE}/wordbooks/${id}/export`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.text()
}

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

// ---- Semantic ----
/** 英→中：校验用户输入的中文答案（语义匹配） */
export const checkChineseAnswer = (standard: string, answer: string) =>
  request<{ match: boolean; score: number; method: string }>('/semantic/check-chinese', {
    method: 'POST',
    body: JSON.stringify({ standard, answer }),
  })

/** 中→英 / 拼写：校验用户输入的英文答案（缩写展开 + 斜杠备选） */
export const checkEnglishAnswer = (standard: string, answer: string) =>
  request<{ match: boolean }>('/semantic/check-english', {
    method: 'POST',
    body: JSON.stringify({ standard, answer }),
  })

// ── 学习计划 ──────────────────────────────────────────────────────

export const getPlan = (student_id: number, wordbook_id: number) =>
  request<StudyPlan>(`/plans?student_id=${student_id}&wordbook_id=${wordbook_id}`)

export const createPlan = (student_id: number, wordbook_id: number, remaining_days: number, daily_peak?: number, target_level?: number) =>
  request<StudyPlan>('/plans', {
    method: 'POST',
    body: JSON.stringify({ student_id, wordbook_id, remaining_days, daily_peak, target_level }),
  })

export const patchPlan = (id: number, data: { remaining_days?: number; daily_peak?: number; status?: string; target_level?: number }) =>
  request<StudyPlan>(`/plans/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })

// ── 今日任务 ──────────────────────────────────────────────────────

export const getTodayTask = (student_id: number, wordbook_id: number) =>
  request<TodayTask>(`/tasks/today?student_id=${student_id}&wordbook_id=${wordbook_id}`)

export const getForecast = (
  student_id: number,
  wordbook_id: number,
  options?: { preview_remaining_days?: number; preview_daily_peak?: number; preview_target_level?: number },
) => {
  const params = new URLSearchParams({ student_id: String(student_id), wordbook_id: String(wordbook_id) })
  if (options?.preview_remaining_days != null) params.set('preview_remaining_days', String(options.preview_remaining_days))
  if (options?.preview_daily_peak != null) params.set('preview_daily_peak', String(options.preview_daily_peak))
  if (options?.preview_target_level != null) params.set('preview_target_level', String(options.preview_target_level))
  return request<Forecast>(`/tasks/forecast?${params}`)
}

export const completeTodayTask = (student_id: number, wordbook_id: number) =>
  request<{ ok: boolean; remaining_days: number; completed_days: number }>('/tasks/complete', {
    method: 'POST',
    body: JSON.stringify({ student_id, wordbook_id }),
  })

export const startTodaySession = (student_id: number, wordbook_id: number) =>
  request<PlanSessionDetail>('/tasks/start', {
    method: 'POST',
    body: JSON.stringify({ student_id, wordbook_id }),
  })

export const startExtraSession = (student_id: number, wordbook_id: number, extra_count: number) =>
  request<PlanSessionDetail>('/tasks/extra', {
    method: 'POST',
    body: JSON.stringify({ student_id, wordbook_id, extra_count }),
  })

export const getWordbookStats = (student_id: number, wordbook_id: number) =>
  request<WordbookStats>(`/tasks/stats?student_id=${student_id}&wordbook_id=${wordbook_id}`)

// ── 宠物 ─────────────────────────────────────────────────────────

export const getPetStatus = (student_id: number) =>
  request<PetStatus>(`/pet/${student_id}`)

export const feedPet = (student_id: number, accuracy?: number) =>
  request<PetFeedResult>(`/pet/${student_id}/feed`, {
    method: 'POST',
    body: JSON.stringify({ accuracy }),
  })

export const useSnack = (student_id: number) =>
  request<{ success: boolean; hunger: number; snack_count: number }>(`/pet/${student_id}/snack`, {
    method: 'POST',
  })

export const earnSnack = (student_id: number) =>
  request<{ success: boolean; snack_count: number }>(`/pet/${student_id}/earn-snack`, {
    method: 'POST',
  })

export const getShopItems = (student_id: number) =>
  request<{ items: import('../types').ShopItem[]; coins: number }>(`/pet/${student_id}/shop`)

export const buyShopItem = (student_id: number, item_id: number) =>
  request<{ success: boolean; item: import('../types').ShopItem; hunger: number; mood_boost: number; coins: number }>(
    `/pet/${student_id}/shop/buy`,
    { method: 'POST', body: JSON.stringify({ item_id }) },
  )

export const getGameWords = (student_id: number) =>
  request<{ questions: import('../types').GameQuestion[] }>(`/pet/${student_id}/game/words`)

export const submitGameResult = (student_id: number, correct_count: number, total_count: number) =>
  request<import('../types').GameResult>(`/pet/${student_id}/game/finish`, {
    method: 'POST',
    body: JSON.stringify({ correct_count, total_count }),
  })
