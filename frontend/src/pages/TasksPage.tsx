import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createQuizSession } from '@/api'
import { useStudent } from '@/hooks/useStudent'
import { useWordbook } from '@/hooks/useWordbook'
import type { QuizType } from '@/types'

const QUIZ_TYPES: { type: QuizType; label: string; desc: string }[] = [
  { type: 'en_to_zh', label: '英译中', desc: '看英文，写出中文含义' },
  { type: 'zh_to_en', label: '中译英', desc: '看中文，写出英文' },
  { type: 'spelling', label: '拼 写', desc: '看中文，键盘拼写英文（仅单词）' },
]

export default function TasksPage() {
  const navigate = useNavigate()
  const { student } = useStudent()
  const { wordbook: selectedWb } = useWordbook()
  const [quizType, setQuizType] = useState<QuizType>('en_to_zh')
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  const handleStart = async () => {
    if (!student) {
      setError('请先在首页选择学生')
      return
    }
    if (!selectedWb) return
    setStarting(true)
    setError('')
    try {
      const session = await createQuizSession(student.id, selectedWb.id, quizType)
      navigate(`/quiz/${session.id}`)
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

      {/* 选择测验阶段 */}
      <p className="text-sm font-semibold text-gray-600 mb-2">选择测验阶段</p>
      <div className="space-y-2 mb-6">
        {QUIZ_TYPES.map(qt => {
          const disabled = qt.type === 'spelling' && selectedWb?.item_count === 0
          return (
            <button
              key={qt.type}
              onClick={() => !disabled && setQuizType(qt.type)}
              disabled={disabled}
              className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-colors ${
                quizType === qt.type
                  ? 'border-primary-500 bg-primary-50'
                  : disabled
                  ? 'border-gray-100 bg-gray-50 opacity-40 cursor-not-allowed'
                  : 'border-gray-100 bg-white'
              }`}
            >
              <span className="font-medium text-gray-800">{qt.label}</span>
              <span className="text-xs text-gray-400 ml-2">{qt.desc}</span>
            </button>
          )
        })}
      </div>

      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

      <button
        onClick={handleStart}
        disabled={starting || !selectedWb || selectedWb.item_count === 0}
        className="w-full bg-primary-600 text-white py-4 rounded-2xl text-lg font-bold disabled:opacity-50 active:scale-95 transition-transform"
      >
        {starting
          ? '创建中…'
          : selectedWb && selectedWb.item_count > 0
          ? `开始测验（${selectedWb.item_count} 个词条）`
          : selectedWb
          ? '单词本暂无词条'
          : '请先选择单词本'}
      </button>

      {!student && (
        <p className="text-center text-xs text-gray-400 mt-3">
          请先在首页选择学生
        </p>
      )}
    </div>
  )
}


