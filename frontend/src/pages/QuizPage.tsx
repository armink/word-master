import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getQuizSession, submitAnswer, finishSession, checkSemantic } from '@/api'
import type { Item, QuizSessionDetail, QuizType } from '@/types'
import TtsButton from '@/components/TtsButton'
import VoiceInput from '@/components/VoiceInput'

type CardState = 'answering' | 'correct' | 'wrong'

async function checkAnswer(item: Item, quizType: QuizType, answer: string): Promise<boolean> {
  const a = answer.trim()
  if (!a) return false
  if (quizType === 'en_to_zh') {
    try {
      const result = await checkSemantic(item.chinese, a)
      return result.match
    } catch {
      return a.toLowerCase() === item.chinese.trim().toLowerCase()
    }
  }
  return a.toLowerCase() === item.english.trim().toLowerCase()
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
  const [voiceError, setVoiceError] = useState('')
  const [isChecking, setIsChecking] = useState(false)
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
  const answeredCount = totalItems - queue.length
  const progress = totalItems > 0 ? (answeredCount / totalItems) : 0
  const realtimeAccuracy = totalItems > 0 ? Math.round((firstCorrectCount / totalItems) * 100) : 0

  // spelling 模式切题后自动 focus
  useEffect(() => {
    if (cardState === 'answering' && session?.quiz_type === 'spelling') {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [cardState, currentItem, session?.quiz_type])

  const doFinish = useCallback(async () => {
    if (finishing) return
    setFinishing(true)
    try { await finishSession(Number(sessionId)) } catch { /* ignore */ }
    navigate(`/quiz/${sessionId}/result`)
  }, [finishing, sessionId, navigate])

  const advanceQueue = useCallback((correct: boolean) => {
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current)
      autoAdvanceTimer.current = null
    }
    setUserAnswer('')
    setVoiceError('')
    setCardStartTime(Date.now())
    if (correct) {
      setQueue(prev => {
        const next = prev.slice(1)
        if (next.length === 0) doFinish()
        return next
      })
    } else {
      setQueue(prev => [...prev.slice(1), prev[0]])
    }
    setCardState('answering')
  }, [doFinish])

  // answerOverride: 语音路径直接传文字，绕过 setState 异步更新
  const handleSubmit = useCallback(async (answerOverride?: string) => {
    if (!session || !currentItem || cardState !== 'answering') return
    const answer = (answerOverride ?? userAnswer).trim()
    if (!answer) return

    const durationMs = Date.now() - cardStartTime
    setIsChecking(true)
    const correct = await checkAnswer(currentItem, session.quiz_type, answer)
    setIsChecking(false)
    setCardState(correct ? 'correct' : 'wrong')

    const first = isFirstAttempt.has(currentItem.id)
    if (correct && first) setFirstCorrectCount(prev => prev + 1)
    if (first) setIsFirstAttempt(prev => { const s = new Set(prev); s.delete(currentItem.id); return s })

    try {
      await submitAnswer(Number(sessionId), {
        item_id: currentItem.id,
        user_answer: answer,
        is_correct: correct,
        duration_ms: durationMs,
      })
    } catch { /* ignore */ }

    // 答对 1.5s 后自动进入下一题；答错不自动跳，等用户手动点继续
    if (correct) {
      autoAdvanceTimer.current = setTimeout(() => advanceQueue(correct), 1500)
    }
  }, [session, currentItem, cardState, userAnswer, cardStartTime, isFirstAttempt, sessionId, advanceQueue])

  if (!session || (queue.length === 0 && !finishing)) {
    return <div className="flex items-center justify-center h-screen text-gray-400">加载中…</div>
  }
  if (!currentItem) return null

  const isAnswering = cardState === 'answering'
  const isCorrect = cardState === 'correct'
  const isWrong = cardState === 'wrong'
  const correctAnswer = session.quiz_type === 'en_to_zh' ? currentItem.chinese : currentItem.english

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-2">
        <button onClick={() => navigate('/tasks')} className="text-gray-400 text-xl">✕</button>
        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-500 rounded-full transition-all duration-500"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="text-xs text-gray-500 shrink-0">{answeredCount}/{totalItems}</span>
        <span className="text-xs font-medium text-primary-600 shrink-0">{realtimeAccuracy}%</span>
      </div>

      {/* 阶段标签 */}
      <div className="px-4 mb-3">
        <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">
          {quizTypeLabel(session.quiz_type)}
        </span>
      </div>

      {/* 主卡片 */}
      <div className="flex-1 px-4 pb-6">
        <div className={`bg-white rounded-3xl shadow-md overflow-hidden transition-all duration-300
          ${isCorrect ? 'border-l-[5px] border-emerald-400' : isWrong ? 'border-l-[5px] border-red-400' : 'border-l-[5px] border-transparent'}`}
        >
          <div className="p-6">

            {/* 题目提示文字 */}
            <p className="text-xs text-gray-400 mb-2">
              {session.quiz_type === 'en_to_zh' ? '这个英文的中文是？'
               : session.quiz_type === 'zh_to_en' ? '这个中文的英文怎么说？'
               : '请拼写这个单词'}
            </p>

            {/* 题目词 + TTS */}
            <div className="flex items-start gap-3 mb-1">
              <p className="flex-1 text-3xl font-bold text-gray-800 leading-tight">
                {quizPrompt(currentItem, session.quiz_type)}
              </p>
              {session.quiz_type === 'en_to_zh' && (
                <TtsButton text={currentItem.english} className="w-10 h-10 shrink-0 mt-1" />
              )}
            </div>

            {/* 音标 */}
            {currentItem.phonetic && session.quiz_type === 'en_to_zh' && (
              <p className="text-sm text-gray-400 mb-3">[{currentItem.phonetic}]</p>
            )}

            {/* ── 结果区 ──
                答题时：min-h 占位（保持卡片高度稳定），内容不渲染
                结果时：内容淡入显示，紧贴音标下方                     */}
            <div className="mb-4" style={{ minHeight: '82px' }}>
              {!isAnswering && (
                <div className={`rounded-2xl px-4 py-3 border
                  ${isCorrect ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}
                >
                  {isCorrect && (
                    <>
                      <p className="text-emerald-700 font-semibold text-sm mb-1">
                        ✅ 正确！
                        {/* 语义近义词：用户答案与标准答案不同时显示"你说：xxx" */}
                        {userAnswer.trim() !== correctAnswer && (
                          <span className="font-normal text-emerald-600 opacity-80 ml-1">
                            （你说：{userAnswer}）
                          </span>
                        )}
                      </p>
                      {currentItem.example_en && (
                        <p className="text-xs text-gray-500 italic">{currentItem.example_en}</p>
                      )}
                      {currentItem.example_zh && (
                        <p className="text-xs text-gray-400">{currentItem.example_zh}</p>
                      )}
                    </>
                  )}
                  {isWrong && (
                    <>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-red-700 font-semibold text-sm">❌ 正确答案：</p>
                        <p className="text-red-800 font-bold">{correctAnswer}</p>
                        <TtsButton text={currentItem.english} className="w-6 h-6 shrink-0" />
                      </div>
                      {currentItem.example_en && (
                        <p className="text-xs text-gray-500 italic">{currentItem.example_en}</p>
                      )}
                      {currentItem.example_zh && (
                        <p className="text-xs text-gray-400">{currentItem.example_zh}</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 输入框：答题时可编辑，结果时 disabled 并带颜色提示 */}
            <input
              ref={inputRef}
              value={userAnswer}
              onChange={e => isAnswering && setUserAnswer(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && isAnswering && userAnswer.trim() && handleSubmit()}
              placeholder={isAnswering ? quizPlaceholder(session.quiz_type) : ''}
              disabled={!isAnswering}
              className={`w-full border-2 rounded-2xl px-4 py-3 text-lg outline-none transition-colors
                ${isAnswering
                  ? 'border-gray-200 focus:border-primary-400 bg-gray-50'
                  : isCorrect
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-red-200 bg-red-50 text-red-500 line-through'
                }`}
            />

            {/* 操作区：答题时=语音/提示，结果时=继续按钮（自动倒计时，可提前点） */}
            <div className="mt-3">
              {isAnswering ? (
                <>
                  {session.quiz_type !== 'spelling' && (
                    <VoiceInput
                      lang={session.quiz_type === 'en_to_zh' ? 'zh_cn' : 'en_us'}
                      onResult={text => {
                        setUserAnswer(text)
                        setVoiceError('')
                        handleSubmit(text)   // 语音松开后直接判断，无需手动提交
                      }}
                      onError={msg => setVoiceError(msg)}
                      disabled={isChecking}
                    />
                  )}
                  {voiceError && (
                    <p className="text-red-500 text-xs mt-1 text-center">{voiceError}</p>
                  )}
                  {isChecking && (
                    <p className="text-center text-sm text-gray-400 mt-2 animate-pulse">判断中…</p>
                  )}
                  {session.quiz_type === 'spelling' && !isChecking && (
                    <p className="text-center text-xs text-gray-300 mt-2">输入后按回车提交</p>
                  )}
                </>
              ) : (
                <button
                  onClick={() => advanceQueue(isCorrect)}
                  className={`w-full py-3.5 rounded-2xl text-base font-bold active:scale-95 transition-transform
                    ${isCorrect
                      ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                      : 'bg-red-400 text-white hover:bg-red-500'
                    }`}
                >
                  {isCorrect ? '下一题 →' : '继续 →'}
                </button>
              )}
            </div>

          </div>
        </div>

        <p className="text-xs text-gray-400 text-center mt-3">
          队列中还有 {queue.length} 个词条
          {queue.length > totalItems && ` （含 ${queue.length - totalItems} 个待重练）`}
        </p>
      </div>
    </div>
  )
}


