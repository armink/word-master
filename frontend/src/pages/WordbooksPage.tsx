import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getWordbooks, createWordbook } from '@/api'
import type { Wordbook } from '@/types'

export default function WordbooksPage() {
  const navigate = useNavigate()
  const [wordbooks, setWordbooks] = useState<Wordbook[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getWordbooks()
      .then(setWordbooks)
      .finally(() => setLoading(false))
  }, [])

  const handleCreate = async () => {
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      const wb = await createWordbook(name.trim(), desc.trim() || undefined)
      setWordbooks(prev => [wb, ...prev])
      setShowForm(false)
      setName('')
      setDesc('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4 pt-4">
        <h1 className="text-xl font-bold text-gray-800">单词本</h1>
        <button
          onClick={() => setShowForm(true)}
          className="bg-primary-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-xl leading-none"
        >
          +
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">加载中…</div>
      ) : wordbooks.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          <p className="text-4xl mb-3">📚</p>
          <p>还没有单词本，点击右上角创建</p>
        </div>
      ) : (
        <div className="space-y-3">
          {wordbooks.map(wb => (
            <button
              key={wb.id}
              onClick={() => navigate(`/wordbooks/${wb.id}`)}
              className="w-full bg-white border border-gray-100 rounded-2xl p-4 text-left shadow-sm active:scale-95 transition-transform"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 truncate">{wb.name}</p>
                  {wb.description && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{wb.description}</p>
                  )}
                </div>
                <span className="ml-3 text-xs text-gray-400 shrink-0">
                  {wb.item_count} 个词条
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 新建单词本弹窗 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-end z-50">
          <div className="bg-white w-full rounded-t-3xl p-6 pb-8">
            <h2 className="text-lg font-bold mb-4">新建单词本</h2>
            <div className="space-y-3">
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="单词本名称（必填）"
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 outline-none focus:border-primary-400"
              />
              <input
                value={desc}
                onChange={e => setDesc(e.target.value)}
                placeholder="描述（可选）"
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 outline-none focus:border-primary-400"
              />
            </div>
            {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setShowForm(false); setName(''); setDesc('') }}
                className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-xl"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !name.trim()}
                className="flex-1 bg-primary-600 text-white py-2.5 rounded-xl disabled:opacity-50"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


