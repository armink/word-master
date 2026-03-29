import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStudents, createStudent, getWordbooks } from '@/api'
import { useStudent } from '@/hooks/useStudent'
import type { Student, Wordbook } from '@/types'

export default function HomePage() {
  const navigate = useNavigate()
  const { student, setStudent } = useStudent()
  const [students, setStudents] = useState<Student[]>([])
  const [wordbooks, setWordbooks] = useState<Wordbook[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getStudents().then(setStudents).catch(() => {})
    getWordbooks().then(setWordbooks).catch(() => {})
  }, [])

  // 自动弹出选人框
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

  return (
    <div className="p-4 pt-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary-700">🌟 Word Master</h1>
          {student && (
            <p className="text-sm text-gray-500 mt-0.5">
              你好，<span className="font-medium text-gray-700">{student.name}</span>！
            </p>
          )}
        </div>
        <button
          onClick={() => setShowPicker(true)}
          className="text-xs text-primary-600 border border-primary-300 rounded-full px-3 py-1"
        >
          切换学生
        </button>
      </div>

      {/* 单词本概览 */}
      <div className="bg-primary-50 rounded-2xl p-4 mb-6">
        <p className="text-sm text-gray-500 mb-1">共有单词本</p>
        <p className="text-3xl font-bold text-primary-700">{wordbooks.length}</p>
        <p className="text-xs text-gray-400 mt-1">
          共 {wordbooks.reduce((s, w) => s + w.item_count, 0)} 个词条
        </p>
      </div>

      {/* 导航卡片 */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <button
          onClick={() => navigate('/tasks')}
          className="bg-primary-600 text-white rounded-2xl p-5 text-left shadow-sm active:scale-95 transition-transform"
        >
          <span className="text-3xl block mb-2">📝</span>
          <span className="text-base font-bold block">今日任务</span>
          <span className="text-xs opacity-80">开始测验</span>
        </button>
        <button
          onClick={() => navigate('/wordbooks')}
          className="bg-white border border-gray-100 rounded-2xl p-5 text-left shadow-sm active:scale-95 transition-transform"
        >
          <span className="text-3xl block mb-2">📚</span>
          <span className="text-base font-bold text-gray-800 block">单词本</span>
          <span className="text-xs text-gray-400">管理词汇</span>
        </button>
      </div>
      <button
        onClick={() => navigate('/records')}
        className="w-full bg-white border border-gray-100 rounded-2xl p-4 text-left shadow-sm active:scale-95 transition-transform flex items-center gap-3"
      >
        <span className="text-2xl">📊</span>
        <div>
          <span className="font-semibold text-gray-800 block">学习记录</span>
          <span className="text-xs text-gray-400">查看掌握度</span>
        </div>
      </button>

      {/* 选学生弹窗 */}
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
              <button
                onClick={() => setShowPicker(false)}
                className="w-full mt-3 text-gray-400 text-sm"
              >
                取消
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


