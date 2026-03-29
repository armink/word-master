import { useEffect, useState } from 'react'
import { getRecords, getWordbooks } from '@/api'
import { useStudent } from '@/hooks/useStudent'
import MasteryBar from '@/components/MasteryBar'
import type { ItemWithMastery, Wordbook } from '@/types'

type Filter = 'all' | 'mastered' | 'weak'

function isMastered(item: ItemWithMastery) {
  const enOk = item.en_to_zh_level >= 80
  const zhOk = item.zh_to_en_level >= 80
  const spOk = item.type === 'phrase' || (item.spelling_level ?? 0) >= 80
  return enOk && zhOk && spOk
}

export default function RecordsPage() {
  const { student } = useStudent()
  const [wordbooks, setWordbooks] = useState<Wordbook[]>([])
  const [selectedWbId, setSelectedWbId] = useState<number | undefined>(undefined)
  const [items, setItems] = useState<ItemWithMastery[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getWordbooks().then(wbs => {
      setWordbooks(wbs)
    })
  }, [])

  useEffect(() => {
    if (!student) return
    setLoading(true)
    getRecords(student.id, selectedWbId)
      .then(setItems)
      .finally(() => setLoading(false))
  }, [student, selectedWbId])

  const filtered = items.filter(item => {
    if (filter === 'mastered') return isMastered(item)
    if (filter === 'weak') return !isMastered(item)
    return true
  })

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'mastered', label: '已掌握' },
    { key: 'weak', label: '待加强' },
  ]

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold text-gray-800 pt-4 mb-4">学习记录</h1>

      {!student ? (
        <div className="text-center text-gray-400 py-12">请先在首页选择学生</div>
      ) : (
        <>
          {/* 单词本筛选 */}
          <div className="flex gap-2 overflow-x-auto pb-1 mb-3 no-scrollbar">
            <button
              onClick={() => setSelectedWbId(undefined)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                selectedWbId === undefined
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'border-gray-200 text-gray-600'
              }`}
            >
              全部
            </button>
            {wordbooks.map(wb => (
              <button
                key={wb.id}
                onClick={() => setSelectedWbId(wb.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  selectedWbId === wb.id
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'border-gray-200 text-gray-600'
                }`}
              >
                {wb.name}
              </button>
            ))}
          </div>

          {/* 掌握度筛选 */}
          <div className="flex gap-1 mb-4">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filter === f.key
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-gray-500'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center text-gray-400 py-8">加载中…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <p className="text-3xl mb-3">📖</p>
              <p>暂无词条记录</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(item => (
                <div key={item.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start gap-2 mb-3">
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 mt-0.5 ${
                        item.type === 'word'
                          ? 'bg-blue-50 text-blue-500'
                          : 'bg-orange-50 text-orange-500'
                      }`}
                    >
                      {item.type === 'word' ? '词' : '句'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800">{item.english}</p>
                      <p className="text-sm text-gray-500">{item.chinese}</p>
                    </div>
                    {isMastered(item) && (
                      <span className="text-primary-500 text-xs shrink-0">✓ 已掌握</span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <MasteryBar label="英译中" value={item.en_to_zh_level} />
                    <MasteryBar label="中译英" value={item.zh_to_en_level} />
                    {item.type === 'word' && (
                      <MasteryBar label="拼写" value={item.spelling_level ?? 0} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}


