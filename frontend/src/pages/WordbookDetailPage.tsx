import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getWordbookDetail, importWords } from '@/api'
import { useStudent } from '@/hooks/useStudent'
import type { WordbookDetail, Item } from '@/types'

export default function WordbookDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { student } = useStudent()
  const [wordbook, setWordbook] = useState<WordbookDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    getWordbookDetail(Number(id))
      .then(setWordbook)
      .catch(() => navigate('/wordbooks'))
      .finally(() => setLoading(false))
  }, [id, navigate])

  const handleImport = async () => {
    if (!importText.trim() || !id) return
    setImporting(true)
    setError('')
    setImportResult(null)
    try {
      const result = await importWords(Number(id), importText.trim())
      setImportResult(result)
      // 刷新词条列表
      const wb = await getWordbookDetail(Number(id))
      setWordbook(wb)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setImporting(false)
    }
  }

  const getMasteryColor = (item: Item) => {
    // 暂无掌握度数据时用灰色
    void student  // 后续连接掌握度
    void item
    return 'text-gray-300'
  }

  if (loading) return <div className="p-4 text-center text-gray-400 pt-16">加载中…</div>
  if (!wordbook) return null

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 pt-4 mb-4">
        <button onClick={() => navigate('/wordbooks')} className="text-gray-500 text-xl">←</button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-800 truncate">{wordbook.name}</h1>
          <p className="text-xs text-gray-400">{wordbook.items.length} 个词条</p>
        </div>
        <button
          onClick={() => { setShowImport(true); setImportResult(null) }}
          className="text-sm text-primary-600 border border-primary-300 rounded-full px-3 py-1"
        >
          导入
        </button>
      </div>

      {wordbook.items.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          <p className="text-3xl mb-3">📝</p>
          <p>还没有词条，点击「导入」添加</p>
          <p className="text-xs mt-2 text-gray-300">格式：apple:苹果（每行一个，或用分号分隔）</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {wordbook.items.map(item => (
            <div key={item.id} className="flex items-center py-3 gap-3">
              <span
                className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${
                  item.type === 'word'
                    ? 'bg-blue-50 text-blue-500'
                    : 'bg-orange-50 text-orange-500'
                }`}
              >
                {item.type === 'word' ? '词' : '句'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 truncate">{item.english}</p>
                <p className="text-sm text-gray-500 truncate">{item.chinese}</p>
              </div>
              <span className={`text-lg ${getMasteryColor(item)}`}>●</span>
            </div>
          ))}
        </div>
      )}

      {/* 导入弹窗 */}
      {showImport && (
        <div className="fixed inset-0 bg-black/40 flex items-end z-50">
          <div className="bg-white w-full rounded-t-3xl p-6 pb-8">
            <h2 className="text-lg font-bold mb-1">导入词条</h2>
            <p className="text-xs text-gray-400 mb-3">
              每行一个，格式：<code className="bg-gray-100 px-1 rounded">英文:中文</code>，也可用分号分隔
            </p>
            <textarea
              autoFocus
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={'apple:苹果\nbanana:香蕉\nI love you:我爱你'}
              rows={6}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary-400 font-mono resize-none"
            />
            {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
            {importResult && (
              <p className="text-primary-600 text-xs mt-1">
                ✓ 成功导入 {importResult.imported} 条
                {importResult.skipped > 0 && `，跳过 ${importResult.skipped} 条`}
              </p>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setShowImport(false); setImportText('') }}
                className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-xl"
              >
                关闭
              </button>
              <button
                onClick={handleImport}
                disabled={importing || !importText.trim()}
                className="flex-1 bg-primary-600 text-white py-2.5 rounded-xl disabled:opacity-50"
              >
                {importing ? '导入中…' : '导入'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


