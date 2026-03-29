import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getWordbooks, createQuizSession } from '@/api'
import { useStudent } from '@/hooks/useStudent'
import type { Wordbook, QuizType } from '@/types'

const QUIZ_TYPES: { type: QuizType; label: string; desc: string }[] = [
  { type: 'en_to_zh', label: '英译中', desc: '看英文，写出中文含义' },
  { type: 'zh_to_en', label: '中译英', desc: '看中文，写出英文' },
  { type: 'spelling', label: '拼 写', desc: '看中文，键盘拼写英文（仅单词）' },
]

export default function TasksPage() {
  const navigate = useNavigate()
  const { student } = useStudent()
  const [wordbooks, setWordbooks] = useState<Wordbook[]>([])
  const [selectedWb, setSelectedWb] = useState<Wordbook | null>(null)
  const [quizType, setQuizType] = useState<QuizType>('en_to_zh')
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getWordbooks()
      .then(wbs => {
        setWordbooks(wbs)
        if (wbs.length > 0) setSelectedWb(wbs[0])
      })
      .finally(() => setLoading(false))
  }, [])

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

  if (loading) return <div className="p-4 text-center text-gray-400 pt-16">加载中…</div>

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold text-gray-800 pt-4 mb-5">今日任务</h1>

      {/* 选择单词本 */}
      <p className="text-sm font-semibold text-gray-600 mb-2">选择单词本</p>
      {wordbooks.length === 0 ? (
        <p className="text-sm text-gray-400 mb-4">
          还没有单词本，请先到「单词本」页面创建并导入词条
        </p>
      ) : (
        <div className="space-y-2 mb-5">
          {wordbooks.map(wb => (
            <button
              key={wb.id}
              onClick={() => setSelectedWb(wb)}
              className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-colors ${
                selectedWb?.id === wb.id
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-100 bg-white'
              }`}
            >
              <span className="font-medium text-gray-800">{wb.name}</span>
              <span className="text-xs text-gray-400 ml-2">{wb.item_count} 个词条</span>
            </button>
          ))}
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
          : selectedWb
          ? `开始测验 ${selectedWb.item_count} 个词条`
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


