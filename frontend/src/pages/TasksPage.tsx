import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTodayTask, startTodaySession, getWordbookStats } from '@/api'
import { useStudent } from '@/hooks/useStudent'
import { useWordbook } from '@/hooks/useWordbook'
import type { TodayTask, WordbookStats } from '@/types'

export default function TasksPage() {
  const navigate = useNavigate()
  const { student } = useStudent()
  const { wordbook: selectedWb } = useWordbook()

  const [task, setTask] = useState<TodayTask | null>(null)
  const [taskLoading, setTaskLoading] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [stats, setStats] = useState<WordbookStats | null>(null)

  const loadTask = () => {
    if (!student || !selectedWb) return
    setTaskLoading(true)
    setError('')
    getTodayTask(student.id, selectedWb.id)
      .then(setTask)
      .catch(e => {
        const msg = (e as Error).message
        if (msg.includes('未找到激活的学习计划')) setTask(null)
        else setError(msg)
      })
      .finally(() => setTaskLoading(false))
    getWordbookStats(student.id, selectedWb.id)
      .then(setStats)
      .catch(() => {})
  }

  useEffect(() => {
    setTask(null)
    loadTask()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.id, selectedWb?.id])

  const handleStart = async () => {
    if (!student || !selectedWb) return
    setStarting(true)
    setError('')
    try {
      const detail = await startTodaySession(student.id, selectedWb.id)
      navigate(`/quiz/${detail.session.id}`)
    } catch (e) {
      setError((e as Error).message)
      setStarting(false)
    }
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold text-gray-800 pt-4 mb-5">今日任务</h1>

      {/* 当前单词本 */}
      {selectedWb ? (
        <div className="bg-primary-50 border border-primary-200 rounded-2xl px-4 py-3 mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs text-primary-500 mb-0.5">当前单词本</p>
            <p className="font-semibold text-primary-800">{selectedWb.name}</p>
            <p className="text-xs text-primary-400">{selectedWb.item_count} 个词条</p>
          </div>
          <span className="text-2xl">📚</span>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-5">
          <p className="text-sm text-amber-700">请先到「单词本」页面，点击「设为当前」选择一个单词本</p>
        </div>
      )}

      {/* 任务主体 */}
      {selectedWb && (
        taskLoading ? (
          <div className="text-center text-gray-400 py-16">
            <p className="text-3xl mb-3 animate-pulse">⏳</p>
            <p className="text-sm">加载任务中…</p>
          </div>
        ) : task ? (
          <>
            {/* 任务统计卡片 */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-blue-50 rounded-2xl p-4 text-center">
                <p className="text-3xl font-bold text-blue-600">{task.review_count}</p>
                <p className="text-xs text-blue-500 mt-1">🔁 需要复习</p>
              </div>
              <div className="bg-green-50 rounded-2xl p-4 text-center">
                <p className="text-3xl font-bold text-green-600">{task.new_count}</p>
                <p className="text-xs text-green-500 mt-1">🆕 今日新词</p>
              </div>
            </div>

            {(task.review_count + task.new_count) === 0 ? (
              <div className="text-center py-8">
                <p className="text-5xl mb-3">🎉</p>
                <p className="font-semibold text-gray-700 mb-1">今日任务已完成！</p>
                <p className="text-sm text-gray-400">
                  {task.remaining_new > 0
                    ? `还有 ${task.remaining_new} 个新词等待学习`
                    : '所有词条均已学完'}
                </p>
                {task.remaining_new > 0 && (
                  <button
                    onClick={() => navigate('/quiz/extra')}
                    className="mt-4 px-6 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold"
                  >
                    继续学习新词
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="bg-gray-50 rounded-xl px-4 py-2 text-xs text-gray-500 mb-5 flex items-center gap-2">
                  <span>📅 每日计划：{task.plan.daily_new} 词</span>
                  <span>·</span>
                  <span>剩余未学：{task.remaining_new} 词</span>
                </div>

                {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

                <button
                  onClick={handleStart}
                  disabled={starting}
                  className="w-full bg-primary-600 text-white py-4 rounded-2xl text-lg font-bold disabled:opacity-50 active:scale-95 transition-transform"
                >
                  {starting
                    ? '准备中…'
                    : (task.in_progress_answered > 0 || task.today_introduced > 0)
                      ? `继续今日任务（剩余 ${task.review_count + task.new_count} 词）`
                      : `开始今日任务（共 ${task.review_count + task.new_count} 词）`
                  }
                </button>
                {task.in_progress_answered > 0 && (
                  <p className="text-center text-sm text-primary-600 mt-2">
                    ✅ 已答对 {task.in_progress_answered} 词，加油继续！
                  </p>
                )}
                {task.in_progress_answered === 0 && task.today_introduced > 0 && (
                  <p className="text-center text-sm text-primary-600 mt-2">
                    ✅ 今日已学 {task.today_introduced} 词，继续加油！
                  </p>
                )}
              </>
            )}
          </>
        ) : (
          /* 无计划提示 */
          <div className="text-center py-12">
            <p className="text-5xl mb-4">📋</p>
            <p className="font-semibold text-gray-700 mb-2">尚未制定学习计划</p>
            <p className="text-sm text-gray-400 mb-6">
              前往单词本详情页，制定艾宾浩斯学习计划，<br />系统将自动安排每日复习
            </p>
            <button
              onClick={() => navigate(`/wordbooks/${selectedWb.id}`)}
              className="px-6 py-3 rounded-2xl bg-primary-600 text-white font-semibold"
            >
              去制定计划
            </button>
            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
          </div>
        )
      )}

      {!student && (
        <p className="text-center text-xs text-gray-400 mt-3">请先在首页选择学生</p>
      )}

      {/* 单词本整体进度 */}
      {stats && stats.total_items > 0 && (
        <div className="mt-5 bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm font-semibold text-gray-700 mb-3">📊 整体学习进度</p>

          {/* 总进度条 */}
          <div className="mb-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>已引入词条</span>
              <span className="font-medium text-primary-600">{stats.introduced} / {stats.total_items}</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-400 rounded-full transition-all duration-500"
                style={{ width: `${Math.round((stats.introduced / stats.total_items) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">{Math.round((stats.introduced / stats.total_items) * 100)}% 已开始学习</p>
          </div>

          {/* 阶段解锁状态 */}
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className={`rounded-xl py-2 px-1 ${stats.introduced > 0 ? 'bg-primary-50 text-primary-700' : 'bg-gray-50 text-gray-400'}`}>
              <p className="text-base mb-0.5">🇬🇧</p>
              <p className="font-semibold">{stats.introduced}</p>
              <p>英→中</p>
            </div>
            <div className={`rounded-xl py-2 px-1 ${stats.zh_to_en_active > 0 ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-400'}`}>
              <p className="text-base mb-0.5">{stats.zh_to_en_active > 0 ? '🔓' : '🔒'}</p>
              <p className="font-semibold">{stats.zh_to_en_active}</p>
              <p>中→英</p>
            </div>
            <div className={`rounded-xl py-2 px-1 ${stats.spelling_active > 0 ? 'bg-purple-50 text-purple-700' : 'bg-gray-50 text-gray-400'}`}>
              <p className="text-base mb-0.5">{stats.spelling_active > 0 ? '🔓' : '🔒'}</p>
              <p className="font-semibold">{stats.spelling_active}</p>
              <p>拼写</p>
            </div>
          </div>

          {/* 解锁说明 */}
          {stats.zh_to_en_active === 0 && stats.introduced > 0 && (
            <p className="text-xs text-gray-400 mt-2 text-center">
              💡 英→中 复习 2 次后自动解锁中→英阶段
            </p>
          )}
        </div>
      )}
    </div>
  )
}



