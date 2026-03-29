import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getQuizSession, getTodayTask, startExtraSession } from '@/api'
import { useStudent } from '@/hooks/useStudent'
import { useWordbook } from '@/hooks/useWordbook'
import type { QuizSession, TodayTask } from '@/types'

function formatDuration(secs: number | null) {
  if (!secs) return '—'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}分${s}秒` : `${s}秒`
}

export default function QuizResultPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { student } = useStudent()
  const { wordbook: selectedWb } = useWordbook()
  const [session, setSession] = useState<QuizSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [todayTask, setTodayTask] = useState<TodayTask | null>(null)
  const [extraStarting, setExtraStarting] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    getQuizSession(Number(sessionId))
      .then(s => setSession(s))
      .finally(() => setLoading(false))
  }, [sessionId])

  useEffect(() => {
    if (!student || !selectedWb) return
    getTodayTask(student.id, selectedWb.id)
      .then(setTodayTask)
      .catch(() => { /* 无计划时忽略 */ })
  }, [student?.id, selectedWb?.id])

  const handleExtra = async (count: number) => {
    if (!student || !selectedWb || extraStarting) return
    setExtraStarting(true)
    try {
      const detail = await startExtraSession(student.id, selectedWb.id, count)
      navigate(`/quiz/${detail.session.id}`)
    } catch (e) {
      alert((e as Error).message)
      setExtraStarting(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-gray-400">加载中…</div>
  }
  if (!session) return null

  const accuracy = session.final_accuracy ?? 0
  const passed = session.status === 'passed' || accuracy >= session.pass_accuracy
  const accuracyPct = Math.round(accuracy * 100)
  const correctCount = session.final_accuracy != null
    ? Math.round(session.final_accuracy * session.total_words)
    : 0

  const remainingNew = todayTask?.remaining_new ?? 0

  return (
    <div className={`min-h-screen flex flex-col ${passed ? 'bg-primary-50' : 'bg-orange-50'}`}>
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        {/* 主图标 */}
        <div className="text-7xl mb-4">{passed ? '🎉' : '💪'}</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          {passed ? '太棒了！' : '继续加油！'}
        </h1>
        <p className="text-gray-500 text-sm mb-8">
          {passed ? '你完成了本次测验！' : '所有单词都已正确完成！'}
        </p>

        {/* 统计卡片 */}
        <div className="w-full bg-white rounded-3xl p-6 shadow-sm mb-6">
          <div className="text-center mb-6">
            <p className="text-xs text-gray-400 mb-1">一次答对率</p>
            <p
              className={`text-5xl font-bold ${
                accuracyPct >= 80 ? 'text-primary-600' : 'text-orange-500'
              }`}
            >
              {accuracyPct}%
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xl font-bold text-gray-800">{session.total_words}</p>
              <p className="text-xs text-gray-400">总词条</p>
            </div>
            <div>
              <p className="text-xl font-bold text-primary-600">{correctCount}</p>
              <p className="text-xs text-gray-400">首次答对</p>
            </div>
            <div>
              <p className="text-xl font-bold text-gray-800">
                {formatDuration(session.duration_seconds)}
              </p>
              <p className="text-xs text-gray-400">用时</p>
            </div>
          </div>
        </div>

        {/* 继续学习新词（有学习计划且有剩余新词时显示） */}
        {remainingNew > 0 && (
          <div className="w-full bg-white rounded-2xl p-4 shadow-sm mb-4 border border-primary-100">
            <p className="text-sm font-semibold text-gray-700 mb-3">
              🆕 还有 <span className="text-primary-600">{remainingNew}</span> 个新词等待学习
            </p>
            <div className="flex gap-2">
              {[5, 10].filter(n => n <= remainingNew).map(count => (
                <button
                  key={count}
                  onClick={() => handleExtra(count)}
                  disabled={extraStarting}
                  className="flex-1 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {extraStarting ? '准备中…' : `继续 +${count} 词`}
                </button>
              ))}
              {remainingNew > 0 && remainingNew < 5 && (
                <button
                  onClick={() => handleExtra(remainingNew)}
                  disabled={extraStarting}
                  className="flex-1 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {extraStarting ? '准备中…' : `全部 +${remainingNew} 词`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="w-full space-y-3">
          <button
            onClick={() => navigate('/tasks')}
            className="w-full bg-primary-600 text-white py-4 rounded-2xl text-base font-bold active:scale-95 transition-transform"
          >
            返回今日任务
          </button>
          <button
            onClick={() => navigate('/records')}
            className="w-full bg-white border border-gray-200 text-gray-600 py-4 rounded-2xl text-base active:scale-95 transition-transform"
          >
            查看学习记录
          </button>
          <button
            onClick={() => navigate('/')}
            className="w-full text-gray-400 text-sm py-2"
          >
            返回首页
          </button>
        </div>
      </div>
    </div>
  )
}



