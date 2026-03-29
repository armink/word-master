import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getQuizSession, submitAnswer, finishSession } from '@/api'
import type { Item, QuizSessionDetail, QuizType } from '@/types'

type CardState = 'answering' | 'correct' | 'wrong'

function checkAnswer(item: Item, quizType: QuizType, userAnswer: string): boolean {
  const answer = userAnswer.trim().toLowerCase()
  if (!answer) return false
  if (quizType === 'en_to_zh') {
    return answer === item.chinese.trim().toLowerCase()
  }
  // zh_to_en & spelling: case-insensitive exact match
  return answer === item.english.trim().toLowerCase()
}

function quizTypeLabel(t: QuizType) {
  if (t === 'en_to_zh') return '英译中'
  if (t === 'zh_to_en') return '中译英'
  return '拼写'
}

function quizPrompt(item: Item, t: QuizType) {
  if (t === 'en_to_zh') return item.english
  return item.chinese
}

function quizPlaceholder(t: QuizType) {
  if (t === 'en_to_zh') return '输入中文含义…'
  if (t === 'zh_to_en') return '输入英文…'
  return '拼写英文…'
}

export default function QuizPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()

  const [session, setSession] = useState<QuizSessionDetail | null>(null)
  const [queue, setQueue] = useState<Item[]>([])
  const [cardState, setCardState] = useState<CardState>('answering')
  const [userAnswer, setUserAnswer] = useState('')
  const [firstCorrectCount, setFirstCorrectCount] = useState(0)
  const [isFirstAttempt, setIsFirstAttempt] = useState<Set<number>>(new Set())
  const [cardStartTime, setCardStartTime] = useState(Date.now())
  const [finishing, setFinishing] = useState(false)
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 加载会话
  useEffect(() => {
    if (!sessionId) return
    getQuizSession(Number(sessionId)).then(s => {
      setSession(s)
      setQueue([...s.items])
      setIsFirstAttempt(new Set(s.items.map(i => i.id)))
      setCardStartTime(Date.now())
    }).catch(() => navigate('/tasks'))
  }, [sessionId, navigate])

  const currentItem = queue[0]
  const totalItems = session?.total_words ?? 0
  const answeredCount = totalItems - queue.length + (cardState !== 'answering' ? 0 : 0)
  const progress = totalItems > 0 ? ((totalItems - queue.length) / totalItems) : 0
  const realtimeAccuracy = totalItems > 0 ? Math.round((firstCorrectCount / totalItems) * 100) : 0

  // 聚焦输入框
  useEffect(() => {
    if (cardState === 'answering') {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [cardState, currentItem])

  const handleSubmit = useCallback(async () => {
    if (!session || !currentItem || cardState !== 'answering') return

    const durationMs = Date.now() - cardStartTime
    const correct = checkAnswer(currentItem, session.quiz_type, userAnswer)

    setCardState(correct ? 'correct' : 'wrong')

    const first = isFirstAttempt.has(currentItem.id)
    if (correct && first) {
      setFirstCorrectCount(prev => prev + 1)
    }
    if (first) {
      setIsFirstAttempt(prev => { const s = new Set(prev); s.delete(currentItem.id); return s })
    }

    try {
      await submitAnswer(Number(sessionId), {
        item_id: currentItem.id,
        user_answer: userAnswer,
        is_correct: correct,
        duration_ms: durationMs,
      })
    } catch {
      // 提交失败不中断流程
    }

    // 自动进入下一题
    const delay = correct ? 1500 : 5000
    autoAdvanceTimer.current = setTimeout(() => advanceQueue(correct), delay)
  }, [session, currentItem, cardState, userAnswer, cardStartTime, isFirstAttempt, sessionId])

  const doFinish = useCallback(async () => {
    if (finishing) return
    setFinishing(true)
    try {
      await finishSession(Number(sessionId))
    } catch {
      // ignore
    }
    navigate(`/quiz/${sessionId}/result`)
  }, [finishing, sessionId, navigate])

  const advanceQueue = useCallback((correct: boolean) => {
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current)
      autoAdvanceTimer.current = null
    }
    setUserAnswer('')
    setCardStartTime(Date.now())

    if (correct) {
      setQueue(prev => {
        const next = prev.slice(1)
        if (next.length === 0) {
          doFinish()
        }
        return next
      })
    } else {
      setQueue(prev => [...prev.slice(1), prev[0]])
    }
    setCardState('answering')
  }, [doFinish])

  if (!session || queue.length === 0 && !finishing) {
    return <div className="flex items-center justify-center h-screen text-gray-400">加载中…</div>
  }

  if (!currentItem) return null

  const isCorrectState = cardState === 'correct'
  const isWrongState = cardState === 'wrong'

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-300 ${
        isCorrectState ? 'bg-primary-50' : isWrongState ? 'bg-red-50' : 'bg-gray-50'
      }`}
    >
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-2">
        <button
          onClick={() => navigate('/tasks')}
          className="text-gray-400 text-xl"
        >
          ✕
        </button>
        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-500 rounded-full transition-all duration-500"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="text-xs text-gray-500 shrink-0">
          {answeredCount}/{totalItems}
        </span>
        <span className="text-xs font-medium text-primary-600 shrink-0">
          {realtimeAccuracy}%
        </span>
      </div>

      {/* 阶段标签 */}
      <div className="px-4 mb-4">
        <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">
          {quizTypeLabel(session.quiz_type)}
        </span>
      </div>

      {/* 卡片 */}
      <div className="flex-1 px-4">
        <div
          className={`rounded-3xl p-6 shadow-md transition-colors duration-300 ${
            isCorrectState
              ? 'bg-primary-500 text-white'
              : isWrongState
              ? 'bg-red-400 text-white'
              : 'bg-white'
          }`}
        >
          {/* 题目 */}
          {!isWrongState && !isCorrectState && (
            <>
              <p className="text-xs text-gray-400 mb-2">
                {session.quiz_type === 'en_to_zh' ? '这个英文的中文是？' :
                 session.quiz_type === 'zh_to_en' ? '这个中文的英文怎么说？' :
                 '请拼写这个单词'}
              </p>
              <p className="text-3xl font-bold text-gray-800 mb-6 leading-tight">
                {quizPrompt(currentItem, session.quiz_type)}
              </p>
              {currentItem.phonetic && session.quiz_type === 'en_to_zh' && (
                <p className="text-sm text-gray-400 -mt-4 mb-4">[{currentItem.phonetic}]</p>
              )}
              <input
                ref={inputRef}
                value={userAnswer}
                onChange={e => setUserAnswer(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && userAnswer.trim() && handleSubmit()}
                placeholder={quizPlaceholder(session.quiz_type)}
                className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-lg outline-none focus:border-primary-400 bg-gray-50"
              />
              <button
                onClick={handleSubmit}
                disabled={!userAnswer.trim()}
                className="w-full mt-3 bg-primary-600 text-white py-3.5 rounded-2xl text-base font-bold disabled:opacity-40 active:scale-95 transition-transform"
              >
                提交 →
              </button>
            </>
          )}

          {/* 答对反馈 */}
          {isCorrectState && (
            <div className="text-center py-4">
              <p className="text-4xl mb-3">✅</p>
              <p className="text-xl font-bold mb-4">正确！</p>
              <div className="bg-white/20 rounded-2xl p-4 text-left">
                <p className="text-lg font-bold">{currentItem.english}</p>
                <p className="text-base mt-1">{currentItem.chinese}</p>
                {currentItem.example_en && (
                  <p className="text-sm mt-3 opacity-80 italic">{currentItem.example_en}</p>
                )}
                {currentItem.example_zh && (
                  <p className="text-sm opacity-70">{currentItem.example_zh}</p>
                )}
              </div>
              <button
                onClick={() => advanceQueue(true)}
                className="mt-4 w-full bg-white/30 hover:bg-white/40 text-white font-bold py-3 rounded-2xl active:scale-95 transition-transform"
              >
                下一题 →
              </button>
            </div>
          )}

          {/* 答错反馈 */}
          {isWrongState && (
            <div className="text-center py-4">
              <p className="text-4xl mb-3">❌</p>
              <p className="text-xl font-bold mb-4">再想想～</p>
              <div className="bg-white/20 rounded-2xl p-4 text-left space-y-2">
                <div>
                  <p className="text-xs opacity-70">你的回答</p>
                  <p className="text-base font-medium line-through opacity-70">
                    {userAnswer || '（未作答）'}
                  </p>
                </div>
                <div>
                  <p className="text-xs opacity-70">正确答案</p>
                  <p className="text-lg font-bold">
                    {session.quiz_type === 'en_to_zh'
                      ? currentItem.chinese
                      : currentItem.english}
                  </p>
                </div>
              </div>
              <button
                onClick={() => advanceQueue(false)}
                className="mt-4 w-full bg-white/30 hover:bg-white/40 text-white font-bold py-3 rounded-2xl active:scale-95 transition-transform"
              >
                继续 →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 队列剩余提示 */}
      <div className="px-4 py-3 text-center">
        <p className="text-xs text-gray-400">
          队列中还有 {queue.length} 个词条
          {queue.length > totalItems && ` （含 ${queue.length - totalItems} 个待重练）`}
        </p>
      </div>
    </div>
  )
}


