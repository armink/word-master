import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getWordbookDetail, importWords, getPlan, createPlan, patchPlan } from '@/api'
import { useStudent } from '@/hooks/useStudent'
import type { WordbookDetail, Item, StudyPlan } from '@/types'

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

  // ── 学习计划 ─────────────────────────────────────────
  const [plan, setPlan] = useState<StudyPlan | null | undefined>(undefined)  // undefined=加载中
  const [showPlanSheet, setShowPlanSheet] = useState(false)
  const [dailyNew, setDailyNew] = useState(10)
  const [planSaving, setPlanSaving] = useState(false)
  const [planError, setPlanError] = useState('')

  useEffect(() => {
    if (!id) return
    getWordbookDetail(Number(id))
      .then(setWordbook)
      .catch(() => navigate('/wordbooks'))
      .finally(() => setLoading(false))
  }, [id, navigate])

  useEffect(() => {
    if (!id || !student) return
    getPlan(student.id, Number(id))
      .then(p => { setPlan(p); setDailyNew(p.daily_new) })
      .catch(() => setPlan(null))
  }, [id, student])

  const handleImport = async () => {
    if (!importText.trim() || !id) return
    setImporting(true)
    setError('')
    setImportResult(null)
    try {
      const result = await importWords(Number(id), importText.trim())
      setImportResult(result)
      const wb = await getWordbookDetail(Number(id))
      setWordbook(wb)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setImporting(false)
    }
  }

  const handleSavePlan = async () => {
    if (!id || !student) return
    setPlanSaving(true)
    setPlanError('')
    try {
      if (plan) {
        const updated = await patchPlan(plan.id, { daily_new: dailyNew, status: 'active' })
        setPlan(updated)
      } else {
        const created = await createPlan(student.id, Number(id), dailyNew)
        setPlan(created)
      }
      setShowPlanSheet(false)
    } catch (e) {
      setPlanError((e as Error).message)
    } finally {
      setPlanSaving(false)
    }
  }

  const getMasteryColor = (item: Item) => {
    void student
    void item
    return 'text-gray-300'
  }

  if (loading) return <div className="p-4 text-center text-gray-400 pt-16">加载中…</div>
  if (!wordbook) return null

  const totalItems = wordbook.items.length
  const estimateDays = dailyNew > 0 ? Math.ceil(totalItems / dailyNew) : '–'

  return (
    <div className="p-4 pb-32">
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

      {/* 学习计划悬浮按钮 */}
      {wordbook.items.length > 0 && (
        <div className="fixed bottom-24 left-0 right-0 px-4 z-40">
          <button
            onClick={() => { setShowPlanSheet(true); setPlanError('') }}
            className="w-full py-3 rounded-2xl font-semibold shadow-lg text-sm
              bg-primary-600 text-white active:opacity-80"
          >
            {plan
              ? `📅 学习计划：每天 ${plan.daily_new} 词（点击修改）`
              : '制定学习计划'}
          </button>
        </div>
      )}

      {/* 制定/修改计划 Sheet */}
      {showPlanSheet && (
        <div className="fixed inset-0 bg-black/40 flex items-end z-50">
          <div className="bg-white w-full rounded-t-3xl p-6 pb-10">
            <h2 className="text-lg font-bold mb-4">
              {plan ? '修改学习计划' : '制定学习计划'}
            </h2>

            <div className="mb-4">
              <label className="block text-sm text-gray-600 mb-2">
                每日新词数
                <span className="ml-2 text-2xl font-bold text-primary-600">{dailyNew}</span>
                <span className="text-xs text-gray-400 ml-1">词</span>
              </label>
              <input
                type="range"
                min={1}
                max={Math.min(50, totalItems)}
                value={dailyNew}
                onChange={e => setDailyNew(Number(e.target.value))}
                className="w-full accent-primary-600"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>1</span>
                <span>{Math.min(50, totalItems)}</span>
              </div>
            </div>

            <div className="bg-primary-50 rounded-xl p-3 mb-5 text-sm text-primary-700">
              共 <span className="font-bold">{totalItems}</span> 个词条，
              预计大约 <span className="font-bold">{estimateDays}</span> 天完成
            </div>

            {planError && <p className="text-red-500 text-xs mb-3">{planError}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setShowPlanSheet(false)}
                className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-xl"
              >
                取消
              </button>
              <button
                onClick={handleSavePlan}
                disabled={planSaving}
                className="flex-1 bg-primary-600 text-white py-2.5 rounded-xl disabled:opacity-50"
              >
                {planSaving ? '保存中…' : (plan ? '保存修改' : '开始计划')}
              </button>
            </div>
          </div>
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



