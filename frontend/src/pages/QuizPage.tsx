import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getQuizSession, submitAnswer, finishSession, checkChineseAnswer, checkEnglishAnswer } from '@/api'
import type { Item, QuizSessionDetail, QuizType } from '@/types'
import TtsButton from '@/components/TtsButton'
import VoiceInput from '@/components/VoiceInput'
import RepeatPanel from '@/components/RepeatPanel'
import { playCorrect, playWrong } from '@/utils/sound'

type CardState = 'answering' | 'correct' | 'wrong'

async function checkAnswer(item: Item, quizType: QuizType, answer: string): Promise<boolean> {
  const a = answer.trim()
  if (!a) return false
  if (quizType === 'en_to_zh') {
    try {
      const result = await checkChineseAnswer(item.chinese, a)
      return result.match
    } catch {
      return a.toLowerCase() === item.chinese.trim().toLowerCase()
    }
  }
  try {
    const result = await checkEnglishAnswer(item.english, a)
    return result.match
  } catch {
    return a.toLowerCase() === item.english.trim().toLowerCase()
  }
}

function quizTypeLabel(t: QuizType) {
  if (t === 'en_to_zh') return '英→中'
  if (t === 'zh_to_en') return '中→英'
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
  const inputRef = useRef<HTMLInputElement>(null)
  const finishingRef = useRef(false)
  // 「不知道」按钮 ref，用原生非被动 touchstart 阻断 Android Chrome 长按「标记为广告」
  const skipBtnRef = useRef<HTMLButtonElement>(null)
  const [exitConfirm, setExitConfirm] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    getQuizSession(Number(sessionId)).then(s => {
      setSession(s)
      setQueue([...s.items])
      setIsFirstAttempt(new Set(s.items.map(i => i.id)))
      setCardStartTime(Date.now())
    }).catch(() => navigate('/tasks'))
  }, [sessionId, navigate])

  const currentItem = queue[0] as (Item & { item_quiz_type?: QuizType }) | undefined
  // 计划模式：每张卡可能有独立 quiz_type；否则使用 session 级别的
  const currentQuizType: QuizType = currentItem?.item_quiz_type ?? session?.quiz_type ?? 'en_to_zh'
  const totalItems = session?.total_words ?? 0
  const answeredCount = totalItems - queue.length
  const progress = totalItems > 0 ? (answeredCount / totalItems) : 0
  const realtimeAccuracy = answeredCount > 0 ? Math.round((firstCorrectCount / answeredCount) * 100) : 0

  // spelling 模式切题后自动 focus
  useEffect(() => {
    if (cardState === 'answering' && currentQuizType === 'spelling') {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [cardState, currentItem, currentQuizType])

  // 答错后：自动朗读正确答案
  useEffect(() => {
    if (cardState !== 'wrong' || !currentItem) return

    // 自动朗读正确答案（英译中念中文，中译英念英文）
    const ttsText = currentQuizType === 'en_to_zh' ? currentItem.chinese : currentItem.english
    const vcn    = currentQuizType === 'en_to_zh' ? 'xiaoyan' : undefined
    fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: ttsText, ...(vcn ? { vcn } : {}) }),
    }).then(r => r.ok ? r.blob() : null).then(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => URL.revokeObjectURL(url)
      audio.play().catch(() => {})
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardState, currentItem?.id])

  // 「不知道」按钮原生非被动 touchstart：阻断 Android Chrome 长按「标记为广告」
  // showSkip 变化时重新绑定（按钮在 spelling 模式下不渲染）
  const showSkip = currentQuizType !== 'spelling' && !isChecking
  useEffect(() => {
    const el = skipBtnRef.current
    if (!el) return
    const prevent = (e: TouchEvent) => e.preventDefault()
    el.addEventListener('touchstart', prevent, { passive: false })
    return () => el.removeEventListener('touchstart', prevent)
  }, [showSkip])

  const doFinish = useCallback(async () => {
    if (finishingRef.current) return
    finishingRef.current = true
    setFinishing(true)
    try { await finishSession(Number(sessionId)) } catch { /* ignore */ }
    navigate(`/quiz/${sessionId}/result`)
  }, [sessionId, navigate])

  // 拦截手机右滑/浏览器返回：进入页面时压入一条历史记录，
  // 用户后退时触发 popstate，显示确认弹窗而非直接退出
  useEffect(() => {
    window.history.pushState(null, '', window.location.href)
    const onPopState = () => {
      if (finishingRef.current) return
      // 再次压入，使"返回"一直可以被拦截
      window.history.pushState(null, '', window.location.href)
      setExitConfirm(true)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const advanceQueue = useCallback((correct: boolean) => {
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
    const correct = await checkAnswer(currentItem, currentQuizType, answer)
    setIsChecking(false)
    setCardState(correct ? 'correct' : 'wrong')
    if (correct) playCorrect(); else playWrong()

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
  }, [session, currentItem, currentQuizType, cardState, userAnswer, cardStartTime, isFirstAttempt, sessionId, advanceQueue])

  const handleSkip = useCallback(async () => {
    if (!session || !currentItem || cardState !== 'answering') return
    const durationMs = Date.now() - cardStartTime
    // 不播错误音："不知道" 只是跳过，不应给孩子施加紧张感
    const first = isFirstAttempt.has(currentItem.id)
    if (first) setIsFirstAttempt(prev => { const s = new Set(prev); s.delete(currentItem.id); return s })
    setCardState('wrong')
    try {
      await submitAnswer(Number(sessionId), {
        item_id: currentItem.id,
        user_answer: '',
        is_correct: false,
        duration_ms: durationMs,
      })
    } catch { /* ignore */ }
  }, [session, currentItem, cardState, cardStartTime, isFirstAttempt, sessionId])

  if (!session || (queue.length === 0 && !finishing)) {
    return <div className="flex items-center justify-center h-screen text-gray-400">加载中…</div>
  }
  if (!currentItem) return null

  const isAnswering = cardState === 'answering'
  const isCorrect = cardState === 'correct'
  const isWrong = cardState === 'wrong'
  const correctAnswer = currentQuizType === 'en_to_zh' ? currentItem.chinese : currentItem.english

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 max-w-md mx-auto relative">
      {/* 顶栏 */}
      <div className="px-4 pt-6 pb-2">
        {/* 第一行：退出 + 进度条 + 进度计数 */}
        <div className="flex items-center gap-3">
          <button onClick={() => setExitConfirm(true)} className="text-gray-400 text-xl">✕</button>
          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all duration-500"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 shrink-0">{answeredCount}/{totalItems}</span>
        </div>
        {/* 第二行：阶段标签 + 首次正确率 */}
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">
            {quizTypeLabel(currentQuizType)}
          </span>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400">首次正确率</span>
            <span className="text-xs font-semibold text-primary-600">{realtimeAccuracy}%</span>
          </div>
        </div>
      </div>

      {/* 阶段标签（已移入顶栏第二行，此处留空占位已删除） */}

      {/* 主卡片 */}
      <div className="flex-1 px-4 pb-6">
        <div className={`bg-white rounded-3xl shadow-md overflow-hidden transition-all duration-300
          ${isCorrect ? 'border-l-[5px] border-emerald-400' : isWrong ? 'border-l-[5px] border-red-400' : 'border-l-[5px] border-transparent'}`}
        >
          <div className="p-6">

            {/* 题目提示文字 */}
            <p className="text-xs text-gray-400 mb-2">
              {currentQuizType === 'en_to_zh' ? '这个英文的中文是？'
               : currentQuizType === 'zh_to_en' ? '这个中文的英文怎么说？'
               : '请拼写这个单词'}
            </p>

            {/* 题目词 + TTS */}
            <div className="flex items-start gap-3 mb-1">
              <p className="flex-1 text-3xl font-bold text-gray-800 leading-tight">
                {quizPrompt(currentItem, currentQuizType)}
              </p>
              {currentQuizType === 'en_to_zh' && (
                <TtsButton text={currentItem.english} className="w-10 h-10 shrink-0 mt-1" />
              )}
            </div>

            {/* 音标 */}
            {currentItem.phonetic && currentQuizType === 'en_to_zh' && (
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
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-emerald-700 font-semibold text-sm">✅ 正确！</p>
                        <p className="text-emerald-800 font-bold">{correctAnswer}</p>
                      </div>
                      {currentItem.example_en && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-xs text-gray-500 italic flex-1">{currentItem.example_en}</p>
                          <TtsButton text={currentItem.example_en} className="w-5 h-5 shrink-0" />
                        </div>
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
                        {/* 英译中：朗读中文答案；中译英/拼写：朗读英文答案 */}
                        {currentQuizType === 'en_to_zh'
                          ? <TtsButton text={currentItem.chinese} vcn="xiaoyan" className="w-6 h-6 shrink-0" />
                          : <TtsButton text={currentItem.english} className="w-6 h-6 shrink-0" />
                        }
                      </div>
                      {currentItem.example_en && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-xs text-gray-500 italic flex-1">{currentItem.example_en}</p>
                          <TtsButton text={currentItem.example_en} className="w-5 h-5 shrink-0" />
                        </div>
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
              onChange={e => isAnswering && currentQuizType === 'spelling' && setUserAnswer(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && isAnswering && userAnswer.trim() && handleSubmit()}
              placeholder={isAnswering ? quizPlaceholder(currentQuizType) : ''}
              disabled={!isAnswering}
              readOnly={currentQuizType !== 'spelling'}
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
                  {currentQuizType !== 'spelling' && (
                    <VoiceInput
                      lang={currentQuizType === 'en_to_zh' ? 'zh_cn' : 'en_us'}
                      onResult={text => {
                        // 方案C：英译中要求纯中文（含中文 且 不含英文字母）
                        // 直接说英文也会被识别到，导致例如 beautiful 的发音被转成 beautiful 通过
                        const hasChinese = /[\u4e00-\u9fa5]/.test(text)
                        const hasLatin = /[a-zA-Z]/.test(text)
                        if (currentQuizType === 'en_to_zh' && (!hasChinese || hasLatin)) {
                          setVoiceError('请只说中文！识别到含有英文，请重试')
                          return
                        }
                        if (currentQuizType !== 'en_to_zh' && !hasLatin) {
                          setVoiceError('请说英文！识别到的不像英文，再试一次')
                          return
                        }
                        setUserAnswer(text)
                        setVoiceError('')
                        handleSubmit(text)
                      }}
                      onError={msg => setVoiceError(msg)}
                      disabled={isChecking}
                    />
                  )}
                  {showSkip && (
                    <button
                      ref={skipBtnRef}
                      onClick={handleSkip}
                      onTouchEnd={handleSkip}
                      onContextMenu={e => e.preventDefault()}
                      style={{
                        touchAction: 'none',
                        WebkitTouchCallout: 'none',
                        WebkitUserSelect: 'none',
                        userSelect: 'none',
                      } as React.CSSProperties}
                      className="w-full mt-2 py-2 rounded-2xl text-sm text-gray-400 border border-gray-200 bg-white hover:bg-gray-50 active:scale-95 transition-transform select-none"
                    >
                      不知道
                    </button>
                  )}
                  {voiceError && (
                    <p className="text-red-500 text-xs mt-1 text-center">{voiceError}</p>
                  )}
                  {isChecking && (
                    <p className="text-center text-sm text-gray-400 mt-2 animate-pulse">判断中…</p>
                  )}
                  {currentQuizType === 'spelling' && !isChecking && (
                    <p className="text-center text-xs text-gray-300 mt-2">输入后按回车提交</p>
                  )}
                </>
              ) : isCorrect ? (
                <button
                  onClick={() => advanceQueue(true)}
                  className="w-full py-3.5 rounded-2xl text-base font-bold bg-emerald-500 text-white hover:bg-emerald-600 active:scale-95 transition-all"
                >
                  继续 →
                </button>
              ) : (
                <RepeatPanel
                  item={currentItem}
                  quizType={currentQuizType}
                  onDone={() => advanceQueue(false)}
                />
              )}
            </div>

          </div>
        </div>

        <p className="text-xs text-gray-400 text-center mt-3">
          队列中还有 {queue.length} 个词条
          {queue.length > totalItems && ` （含 ${queue.length - totalItems} 个待重练）`}
        </p>
      </div>

      {/* 退出确认弹窗（✕ 按钮 / 右滑手势 / 浏览器返回时触发） */}
      {exitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
          <div className="bg-white rounded-3xl p-6 shadow-xl w-full max-w-sm">
            <p className="text-lg font-bold text-gray-800 mb-1">退出测验？</p>
            <p className="text-sm text-gray-500 mb-5">
              已作答的词汇进度会保存，未答的不计入本轮成绩。
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={async () => {
                  setExitConfirm(false)
                  finishingRef.current = true
                  try { await finishSession(Number(sessionId)) } catch { /* ignore */ }
                  navigate('/tasks')
                }}
                className="w-full py-3 rounded-2xl bg-gray-700 text-white font-bold active:scale-95 transition-transform"
              >
                退出并保存进度
              </button>
              <button
                onClick={() => setExitConfirm(false)}
                className="w-full py-3 rounded-2xl bg-primary-50 text-primary-700 font-bold active:scale-95 transition-transform"
              >
                继续答题
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


