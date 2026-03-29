import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTodayTask, startTodaySession } from '@/api'
import { useStudent } from '@/hooks/useStudent'
import { useWordbook } from '@/hooks/useWordbook'
import type { TodayTask } from '@/types'

export default function TasksPage() {
  const navigate = useNavigate()
  const { student } = useStudent()
  const { wordbook: selectedWb } = useWordbook()

  const [task, setTask] = useState<TodayTask | null>(null)
  const [taskLoading, setTaskLoading] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

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
                  {starting ? '准备中…' : `开始今日任务（共 ${task.review_count + task.new_count} 词）`}
                </button>
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
    </div>
  )
}



