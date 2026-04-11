import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStudents, createStudent, getWordbooks, getTodayTask, getPetStatus, startTodaySession, getForecast } from '@/api'
import { useStudent } from '@/hooks/useStudent'
import { useWordbook } from '@/hooks/useWordbook'
import type { Student, Wordbook, TodayTask, PetStatus, Forecast } from '@/types'
import LearningForecastChart from '@/components/LearningForecastChart'

export default function HomePage() {
  const navigate = useNavigate()
  const { student, setStudent } = useStudent()
  const { wordbook: currentWb } = useWordbook()
  const [students, setStudents] = useState<Student[]>([])
  const [wordbooks, setWordbooks] = useState<Wordbook[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [todayTask, setTodayTask] = useState<TodayTask | null>(null)
  const [pet, setPet] = useState<PetStatus | null>(null)
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    getStudents().then(setStudents).catch(() => {})
    getWordbooks().then(setWordbooks).catch(() => {})
  }, [])

  useEffect(() => {
    if (!student || !currentWb) { setTodayTask(null); return }
    getTodayTask(student.id, currentWb.id).then(setTodayTask).catch(() => setTodayTask(null))
  }, [student?.id, currentWb?.id])

  useEffect(() => {
    if (!student || !currentWb) { setForecast(null); return }
    getForecast(student.id, currentWb.id).then(setForecast).catch(() => setForecast(null))
  }, [student?.id, currentWb?.id])

  useEffect(() => {
    if (!student) { setPet(null); return }
    getPetStatus(student.id).then(setPet).catch(() => setPet(null))
  }, [student?.id])

  // 无学生时自动弹出选人框
  useEffect(() => {
    if (!student) setShowPicker(true)
  }, [student])

  const handleSelectStudent = (s: Student) => {
    setStudent(s)
    setShowPicker(false)
  }

  const handleCreateStudent = async () => {
    if (!newName.trim()) return
    setCreating(true)
    setError('')
    try {
      const s = await createStudent(newName.trim())
      setStudents(prev => [...prev, s])
      handleSelectStudent(s)
      setNewName('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const handleStartQuiz = async () => {
    if (!student || !currentWb || starting) return
    setStarting(true)
    try {
      const session = await startTodaySession(student.id, currentWb.id)
      navigate(`/quiz/${session.session.id}`)
    } catch (e) {
      setStarting(false)
    }
  }

  const totalWords = wordbooks.reduce((s, w) => s + w.item_count, 0)
  const taskTotal  = todayTask ? todayTask.review_count + todayTask.new_count : 0
  const taskDone   = taskTotal === 0 && todayTask !== null

  // 今日负荷状态
  const reviewLoad = todayTask?.review_count ?? 0
  const planPeak   = todayTask?.plan.daily_peak ?? 50
  const loadStatus = !todayTask || taskDone ? null
    : reviewLoad >= planPeak               ? 'red'
    : reviewLoad >= Math.floor(planPeak * 0.7) ? 'yellow'
    : 'green'

  return (
    <div className="p-4 pt-10 pb-28">
      {/* ── 顶部：问候 + 切换学生 ─────────────────────────── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary-700">🌟 Word Master</h1>
          {student ? (
            <p className="text-sm text-gray-500 mt-0.5">
              你好，<span className="font-medium text-gray-700">{student.name}</span>！
              {pet && pet.streak_days >= 2 && (
                <span className="ml-2 text-orange-500 font-medium">🔥 {pet.streak_days} 天连击</span>
              )}
            </p>
          ) : (
            <p className="text-sm text-gray-400 mt-0.5">请先选择学生</p>
          )}
        </div>
        <button
          onClick={() => setShowPicker(true)}
          className="text-xs text-primary-600 border border-primary-300 rounded-full px-3 py-1.5 shrink-0"
        >
          切换学生
        </button>
      </div>

      {/* ── 今日任务主卡片 ──────────────────────────────────── */}
      {student && currentWb ? (
        <div
          className={`rounded-3xl p-5 mb-4 shadow-sm
            ${taskDone
              ? 'bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100'
              : 'bg-gradient-to-br from-primary-500 to-primary-600'
            }`}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className={`text-xs font-medium mb-0.5 ${taskDone ? 'text-green-500' : 'text-white/70'}`}>
                {currentWb.name}
              </p>
              <p className={`text-lg font-bold ${taskDone ? 'text-green-700' : 'text-white'}`}>
                {taskDone ? '今日任务全部完成 🎉' : '今日任务'}
              </p>
              {loadStatus && (
                <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium
                  ${ loadStatus === 'red'    ? 'bg-red-100/80 text-red-700'
                   : loadStatus === 'yellow' ? 'bg-yellow-100/80 text-yellow-700'
                   : 'bg-green-100/80 text-green-700'}`}
                >
                  {loadStatus === 'red' ? '🔴 负荷过重' : loadStatus === 'yellow' ? '🟡 复习积压' : '🟢 状态正常'}
                </span>
              )}
            </div>
            <span className="text-3xl">{taskDone ? '✅' : '📝'}</span>
          </div>

          {!taskDone && todayTask && (
            <div className="flex gap-4 mb-4">
              <div className={`text-center`}>
                <p className="text-2xl font-bold text-white">{todayTask.review_count}</p>
                <p className="text-xs text-white/70">需要复习</p>
              </div>
              {todayTask.new_count > 0 && (
                <>
                  <div className="w-px bg-white/20" />
                  <div className="text-center">
                    <p className="text-2xl font-bold text-white">{todayTask.new_count}</p>
                    <p className="text-xs text-white/70">今日新词</p>
                  </div>
                </>
              )}
              <div className="w-px bg-white/20" />
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{todayTask.plan.remaining_days}</p>
                <p className="text-xs text-white/70">剩余天数</p>
              </div>
            </div>
          )}

          {/* 计划滞后警告 */}
          {todayTask && todayTask.plan.remaining_days === 0 && todayTask.total_unintroduced > 0 && (
            <div className="bg-orange-400/20 border border-orange-300/40 rounded-xl px-3 py-2 mb-3">
              <p className="text-xs text-white font-medium">
                ⚠️ 计划天数已用完，还有 {todayTask.total_unintroduced} 词未学。请到词本页面调整计划天数。
              </p>
            </div>
          )}

          {taskDone ? (
            <button
              onClick={() => navigate('/tasks')}
              className="w-full bg-green-100 text-green-700 font-semibold py-3 rounded-2xl text-sm active:opacity-80"
            >
              查看学习进度
            </button>
          ) : taskTotal > 0 ? (
            <button
              onClick={handleStartQuiz}
              disabled={starting}
              className="w-full bg-white text-primary-600 font-bold py-3 rounded-2xl text-sm shadow-sm active:opacity-80 disabled:opacity-60"
            >
              {starting ? '加载中…' : `开始今日任务（共 ${taskTotal} 词）`}
            </button>
          ) : (
            <button
              onClick={() => navigate('/tasks')}
              className="w-full bg-white/20 text-white font-semibold py-3 rounded-2xl text-sm active:opacity-80"
            >
              查看任务详情
            </button>
          )}
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-100 rounded-3xl p-5 mb-4 text-center text-gray-400 text-sm">
          {student ? '未选择单词本，前往单词本页面选择' : '请先选择学生'}
        </div>
      )}

      {/* ── 学习负荷预测图 ──────────────────────────────────── */}
      {student && currentWb && forecast && (
        <div className="bg-white border border-gray-100 rounded-2xl p-4 mb-3 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-700">📈 学习负荷预测</p>
            {forecast.projected_completion_date && (
              <p className="text-xs text-green-600 font-medium">
                预计完成：{String(forecast.projected_completion_date).slice(4,6)}/{String(forecast.projected_completion_date).slice(6,8)}
              </p>
            )}
          </div>
          <LearningForecastChart forecast={forecast} maxDays={21} />
        </div>
      )}

      {/* ── 宠物小挂件 + 单词本 两列 ──────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* 宠物 */}
        <button
          onClick={() => navigate('/pet')}
          className="bg-white border border-gray-100 rounded-2xl p-4 text-left shadow-sm active:scale-95 transition-transform"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-400">我的宠物</span>
            {pet && !pet.fed_today && (
              <span className="text-xs bg-orange-100 text-orange-500 px-1.5 py-0.5 rounded-full">未喂食</span>
            )}
            {pet?.fed_today && (
              <span className="text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full">已喂食</span>
            )}
          </div>
          <p className="text-4xl mb-1">
            {pet ? (pet.is_sick ? '🤒' : pet.stage_emoji) : '🥚'}
          </p>
          <p className="text-xs font-semibold text-gray-700">{pet?.stage_name ?? '加载中…'}</p>
          {pet && (
            <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${pet.hunger < 30 ? 'bg-red-400' : 'bg-green-400'}`}
                style={{ width: `${pet.hunger}%` }}
              />
            </div>
          )}
        </button>

        {/* 单词本 */}
        <button
          onClick={() => navigate('/wordbooks')}
          className="bg-white border border-gray-100 rounded-2xl p-4 text-left shadow-sm active:scale-95 transition-transform"
        >
          <span className="text-xs font-medium text-gray-400 block mb-2">单词本</span>
          <p className="text-4xl mb-1">📚</p>
          <p className="text-xs font-semibold text-gray-700 truncate">
            {currentWb?.name ?? `${wordbooks.length} 本`}
          </p>
          <p className="text-xs text-gray-400 mt-1">共 {totalWords} 词条</p>
        </button>
      </div>

      {/* ── 学习记录入口 ──────────────────────────────────── */}
      <button
        onClick={() => navigate('/records')}
        className="w-full bg-white border border-gray-100 rounded-2xl p-4 text-left shadow-sm active:scale-95 transition-transform flex items-center gap-3"
      >
        <span className="text-2xl">📊</span>
        <div className="flex-1">
          <span className="font-semibold text-gray-800 block text-sm">学习记录</span>
          <span className="text-xs text-gray-400">查看掌握度</span>
        </div>
        <span className="text-gray-300 text-lg">›</span>
      </button>

      {/* ── 选学生弹窗 ──────────────────────────────────── */}
      {showPicker && (
        <div className="fixed inset-0 bg-black/40 flex items-end z-50">
          <div className="bg-white w-full rounded-t-3xl p-6 pb-8">
            <h2 className="text-lg font-bold mb-4">选择学生</h2>
            {students.length > 0 && (
              <div className="space-y-2 mb-4">
                {students.map(s => (
                  <button
                    key={s.id}
                    onClick={() => handleSelectStudent(s)}
                    className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-colors ${
                      student?.id === s.id
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-100 hover:border-primary-200'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateStudent()}
                placeholder="新学生名字"
                className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary-400"
              />
              <button
                onClick={handleCreateStudent}
                disabled={creating || !newName.trim()}
                className="bg-primary-600 text-white px-4 py-2 rounded-xl text-sm disabled:opacity-50"
              >
                创建
              </button>
            </div>
            {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
            {student && (
              <button onClick={() => setShowPicker(false)} className="w-full mt-3 text-gray-400 text-sm">
                取消
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
