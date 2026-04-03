/**
 * 每日闪卡小游戏
 * - 10-15 道英→中 4 选 1 题，优先选取错误率高的词
 * - 答对 1 题 +3 金币，满分额外 +5
 * - 每天只能玩一次
 */
import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStudent } from '@/hooks/useStudent'
import { getGameWords, submitGameResult } from '@/api'
import type { GameQuestion } from '@/types'

type Phase = 'loading' | 'ready' | 'playing' | 'result'

export default function PetGamePage() {
  const navigate = useNavigate()
  const { student } = useStudent()

  const [phase, setPhase] = useState<Phase>('loading')
  const [questions, setQuestions] = useState<GameQuestion[]>([])
  const [current, setCurrent] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [answers, setAnswers] = useState<(boolean | null)[]>([])
  const [timeLeft, setTimeLeft] = useState(6)
  const [petAnim, setPetAnim] = useState<'bounce' | 'shake' | 'float'>('float')
  const [coins, setCoins] = useState<number | null>(null)
  const [coinEarned, setCoinEarned] = useState(0)
  const [error, setError] = useState('')
  const [alreadyPlayed, setAlreadyPlayed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }, [])

  // 加载题目
  useEffect(() => {
    if (!student) return
    getGameWords(student.id)
      .then(d => { setQuestions(d.questions); setPhase('ready') })
      .catch(e => {
        const msg = (e as Error).message
        // 已玩过或词不足
        if (msg.includes('已学单词不足')) { setError(msg); setPhase('result') }
        else { setError(msg); setPhase('result') }
      })
  }, [student])

  // 计时器
  useEffect(() => {
    if (phase !== 'playing' || selected !== null) return
    setTimeLeft(6)
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          stopTimer()
          // 超时 = 答错
          handleAnswer(null)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => stopTimer()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, current])

  const handleAnswer = useCallback((choice: string | null) => {
    if (phase !== 'playing' || selected !== null) return
    stopTimer()
    const q = questions[current]
    const correct = choice === q.answer
    setSelected(choice ?? '__timeout__')
    setPetAnim(correct ? 'bounce' : 'shake')
    setAnswers(prev => {
      const next = [...prev]
      next[current] = correct
      return next
    })
    if (correct) setCorrectCount(c => c + 1)

    // 0.9s 后跳下一题或结算
    setTimeout(() => {
      setPetAnim('float')
      setSelected(null)
      if (current + 1 >= questions.length) {
        finishGame(correct ? correctCount + 1 : correctCount)
      } else {
        setCurrent(c => c + 1)
      }
    }, 900)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, selected, questions, current, correctCount])

  const finishGame = async (finalCorrect: number) => {
    if (!student) return
    setPhase('result')
    try {
      const r = await submitGameResult(student.id, finalCorrect, questions.length)
      if (r.already_played) { setAlreadyPlayed(true); setCoins(r.coins) }
      else { setCoins(r.coins); setCoinEarned(r.coin_earned) }
    } catch {}
  }

  const petEmoji = petAnim === 'bounce' ? '🎉' : petAnim === 'shake' ? '😵' : '🐾'
  const animClass = petAnim === 'bounce' ? 'animate-pet-bounce' : petAnim === 'shake' ? 'animate-pet-shiver' : 'animate-pet-float'

  // ── 加载中 ──────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <span className="text-6xl animate-bounce">🎴</span>
        <p className="text-gray-400 text-sm">出题中…</p>
      </div>
    )
  }

  // ── 错误 / 已完成 / 结算 ──────────────────────────────────────
  if (phase === 'result') {
    const perfect = correctCount >= questions.length && questions.length > 0
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-indigo-50 flex flex-col">
        {/* 顶部 */}
        <div className="flex items-center px-4 pt-12 pb-4">
          <button onClick={() => navigate('/pet')} className="text-gray-400 text-2xl mr-3">‹</button>
          <h1 className="text-lg font-bold text-gray-800">每日闪卡</h1>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-8 pb-20">
          {error ? (
            <>
              <span className="text-6xl mb-6">😅</span>
              <p className="text-gray-600 text-center mb-8">{error}</p>
            </>
          ) : alreadyPlayed ? (
            <>
              <span className="text-6xl mb-6">✅</span>
              <p className="text-xl font-bold text-gray-800 mb-2">今天已经玩过啦</p>
              <p className="text-gray-400 text-sm mb-8">明天再来挑战吧！</p>
              <div className="flex items-center gap-2 bg-yellow-50 px-5 py-3 rounded-2xl">
                <span className="text-2xl">🪙</span>
                <span className="text-xl font-bold text-yellow-600">{coins}</span>
              </div>
            </>
          ) : (
            <>
              {/* 结果 emoji */}
              <div className={`text-8xl mb-4 ${perfect ? 'animate-pet-bounce' : ''}`}>
                {perfect ? '🏆' : correctCount >= 3 ? '⭐' : '💪'}
              </div>

              <p className="text-2xl font-bold text-gray-800 mb-1">
                {correctCount} / {questions.length}
              </p>
              <p className="text-gray-400 text-sm mb-6">
                {perfect ? '完美！全部答对！' : correctCount / questions.length >= 0.6 ? '不错哦，继续加油！' : '再接再厉，明天还有机会！'}
              </p>

              {/* 答题明细 - flex-wrap 支持多题 */}
              <div className="flex flex-wrap justify-center gap-1.5 mb-6 max-w-xs">
                {answers.map((ok, i) => (
                  <div key={i} className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                    ${ok === true ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
                    {ok === true ? '✓' : '✗'}
                  </div>
                ))}
              </div>

              {/* 金币奖励 */}
              {coinEarned > 0 && (
                <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 px-5 py-3 rounded-2xl mb-2">
                  <span className="text-2xl">🪙</span>
                  <div>
                    <p className="font-bold text-yellow-600">+{coinEarned} 金币</p>
                    <p className="text-xs text-yellow-400">当前 {coins} 金币</p>
                  </div>
                </div>
              )}
              {perfect && (
                <p className="text-xs text-amber-500 font-medium mt-1">🎊 满分奖励 +5 金币已包含</p>
              )}
            </>
          )}

          <button
            onClick={() => navigate('/pet')}
            className="mt-8 w-full max-w-xs bg-primary-500 text-white font-semibold py-3.5 rounded-2xl active:opacity-80"
          >
            返回宠物页
          </button>
        </div>
      </div>
    )
  }

  // ── 准备界面 ──────────────────────────────────────────────────
  if (phase === 'ready') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-indigo-50 flex flex-col">
        <div className="flex items-center px-4 pt-12 pb-4">
          <button onClick={() => navigate('/pet')} className="text-gray-400 text-2xl mr-3">‹</button>
          <h1 className="text-lg font-bold text-gray-800">每日闪卡</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-8 pb-20 gap-6">
          <span className="text-8xl animate-pet-float">🎴</span>
          <div className="text-center">
            <p className="text-xl font-bold text-gray-800 mb-2">每日闪卡小游戏</p>
            <p className="text-gray-400 text-sm">{questions.length} 道单词选择题</p>
            <p className="text-gray-400 text-sm">答对 1 题 +3 金币，满分额外 +5</p>
          </div>
          <button
            onClick={() => setPhase('playing')}
            className="bg-purple-500 text-white font-bold text-lg px-12 py-4 rounded-2xl shadow-md active:opacity-80"
          >
            开始游戏 🚀
          </button>
        </div>
      </div>
    )
  }

  // ── 游戏进行中 ────────────────────────────────────────────────
  const q = questions[current]
  const progress = ((current) / questions.length) * 100

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-indigo-50 flex flex-col">
      {/* 顶部 */}
      <div className="px-4 pt-12 pb-2">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => navigate('/pet')} className="text-gray-400 text-2xl">‹</button>
          {/* 题号 */}
          <span className="text-sm font-medium text-gray-500">{current + 1} / {questions.length}</span>
          {/* 倒计时 */}
          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm
            ${timeLeft <= 2 ? 'bg-red-100 text-red-500' : 'bg-white text-gray-600 shadow-sm'}`}>
            {timeLeft}
          </div>
        </div>
        {/* 进度条 */}
        <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
          <div
            className="h-full bg-purple-400 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 宠物区 */}
      <div className="flex justify-center py-4">
        <span className={`text-7xl ${animClass}`}>{petEmoji}</span>
      </div>

      {/* 题目卡片 */}
      <div className="mx-4 bg-white/80 backdrop-blur rounded-3xl p-6 mb-4 shadow-sm text-center">
        <p className="text-xs text-gray-400 mb-2 tracking-wider uppercase">这个词的意思是？</p>
        <p className="text-3xl font-bold text-gray-800">{q.english}</p>
      </div>

      {/* 选项 */}
      <div className="px-4 grid grid-cols-2 gap-3">
        {q.options.map((opt, i) => {
          const isSelected = selected === opt || (selected === '__timeout__' && false)
          const isCorrect = opt === q.answer
          const revealed = selected !== null

          let cls = 'bg-white border-gray-200'
          if (revealed) {
            if (isCorrect) cls = 'bg-green-100 border-green-400'
            else if (isSelected && !isCorrect) cls = 'bg-red-100 border-red-400'
          } else if (isSelected) {
            cls = 'bg-purple-50 border-purple-400'
          }

          return (
            <button
              key={i}
              disabled={selected !== null}
              onClick={() => handleAnswer(opt)}
              className={`border-2 rounded-2xl py-4 px-3 text-sm font-medium transition-all active:scale-95 ${cls}`}
            >
              {opt}
            </button>
          )
        })}
      </div>

      {/* 超时提示 */}
      {selected === '__timeout__' && (
        <p className="text-center text-red-400 text-sm mt-4 font-medium">⏰ 时间到！</p>
      )}
    </div>
  )
}
