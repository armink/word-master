import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getWordbookDetail, importWords, exportWordbook, getPlan, createPlan, patchPlan, getForecast } from '@/api'
import { useStudent } from '@/hooks/useStudent'
import type { WordbookDetail, Item, StudyPlan, Forecast } from '@/types'
import LearningForecastChart from '@/components/LearningForecastChart'

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
  const [remainingDays, setRemainingDays] = useState(30)
  const [dailyPeak, setDailyPeak] = useState(50)
  const [targetLevel, setTargetLevel] = useState(2)
  const [planSaving, setPlanSaving] = useState(false)
  const [planError, setPlanError] = useState('')
  const [forecast, setForecast] = useState<Forecast | null>(null)
  // forecastStale: 参数已变更、等待新数据；保留旧图表，仅降低透明度
  const [forecastStale, setForecastStale] = useState(false)

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
      .then(p => { setPlan(p); setRemainingDays(p.remaining_days); setDailyPeak(p.daily_peak); setTargetLevel(p.target_level ?? 2) })
      .catch(() => setPlan(null))
  }, [id, student])

  // 预测图表：参数变化时标记"过期"，防抖 600ms 后发请求，新数据到达前保留旧图降低透明度
  useEffect(() => {
    if (!showPlanSheet || !id || !student) return
    setForecastStale(true)
    const timer = setTimeout(() => {
      getForecast(student.id, Number(id), {
        preview_remaining_days: remainingDays,
        preview_daily_peak: dailyPeak,
        preview_target_level: targetLevel,
      })
        .then(data => { setForecast(data); setForecastStale(false) })
        .catch(() => setForecastStale(false))
    }, 600)
    return () => clearTimeout(timer)
  }, [showPlanSheet, id, student, remainingDays, dailyPeak, targetLevel])

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
        const updated = await patchPlan(plan.id, { remaining_days: remainingDays, daily_peak: dailyPeak, status: 'active', target_level: targetLevel })
        setPlan(updated)
      } else {
        const created = await createPlan(student.id, Number(id), remainingDays, dailyPeak, targetLevel)
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

  const handleExport = async () => {
    if (!id || !wordbook) return
    try {
      const text = await exportWordbook(Number(id))
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${wordbook.name}.txt`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert((e as Error).message)
    }
  }

  if (loading) return <div className="p-4 text-center text-gray-400 pt-16">加载中…</div>
  if (!wordbook) return null

  const totalItems = wordbook.items.length


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
        <button
          onClick={handleExport}
          className="text-sm text-gray-600 border border-gray-300 rounded-full px-3 py-1"
        >
          导出
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
              ? `📅 学习计划：剩余 ${plan.remaining_days} 天（点击修改）`
              : '制定学习计划'}
          </button>
        </div>
      )}

      {/* 制定/修改计划 Sheet */}
      {showPlanSheet && (
        <div className="fixed inset-0 bg-black/40 flex items-end z-50">
          <div className="bg-white w-full rounded-t-3xl p-6 pb-10 overflow-y-auto max-h-[90vh]">
            <h2 className="text-lg font-bold mb-4">
              {plan ? '修改学习计划' : '制定学习计划'}
            </h2>

            {/* 学习目标 */}
            <div className="mb-5">
              <p className="text-sm text-gray-600 mb-2">学习目标</p>
              <div className="flex gap-2">
                {[
                  { level: 1, label: '认识', desc: '英译中' },
                  { level: 2, label: '能说', desc: '英译中 + 中译英' },
                  { level: 3, label: '会写', desc: '含拼写' },
                ].map(opt => (
                  <button
                    key={opt.level}
                    onClick={() => setTargetLevel(opt.level)}
                    className={`flex-1 rounded-xl border-2 py-2.5 px-1 text-center transition-colors ${
                      targetLevel === opt.level
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 text-gray-500'
                    }`}
                  >
                    <div className="font-semibold text-sm">{opt.label}</div>
                    <div className="text-xs mt-0.5 leading-tight text-gray-400">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 几天背完 */}
            <div className="mb-5">
              <div className="flex items-baseline justify-between mb-2">
                <label className="text-sm text-gray-600">几天背完？</label>
                <span className="text-2xl font-bold text-primary-600">
                  {remainingDays} <span className="text-sm font-normal text-gray-400">天</span>
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={Math.max(60, remainingDays)}
                step={1}
                value={remainingDays}
                onChange={e => setRemainingDays(Number(e.target.value))}
                className="w-full accent-primary-500 cursor-pointer h-2"
                style={{ touchAction: 'none' }}
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>1天</span>
                <span className="text-gray-500">
                  每天约 <span className="font-medium text-primary-500">{Math.ceil(totalItems / Math.max(1, remainingDays))}</span> 新词
                </span>
                <span>{Math.max(60, remainingDays)}天</span>
              </div>
            </div>

            {/* 每日上限 */}
            <div className="mb-5">
              <div className="flex items-baseline justify-between mb-2">
                <label className="text-sm text-gray-600">每日上限（含复习）</label>
                <span className="text-2xl font-bold text-primary-600">
                  {dailyPeak} <span className="text-sm font-normal text-gray-400">词</span>
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={Math.min(dailyPeak, 100)}
                onChange={e => setDailyPeak(Number(e.target.value))}
                className="w-full accent-primary-500 cursor-pointer h-2"
                style={{ touchAction: 'none' }}
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>10词</span>
                <span>100词</span>
              </div>
            </div>

            {/* 预测图表：数据刷新时保留旧图（半透明），避免闪烁 */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-500">每日负荷预测</p>
                {forecastStale && <span className="text-xs text-gray-300 animate-pulse">更新中…</span>}
              </div>
              {forecast
                ? <div style={{ opacity: forecastStale ? 0.4 : 1, transition: 'opacity 0.2s' }}>
                    <LearningForecastChart forecast={forecast} />
                  </div>
                : forecastStale
                  ? <div className="h-24 rounded-xl bg-gray-100 animate-pulse" />
                  : null
              }
              {forecast && forecast.projected_completion_date && (
                <p className="text-xs text-gray-500 mt-1">
                  预计完成日：{String(forecast.projected_completion_date).slice(0,4)}/{String(forecast.projected_completion_date).slice(4,6)}/{String(forecast.projected_completion_date).slice(6,8)}
                </p>
              )}
              {forecast && (
                <p className="text-xs text-gray-400 mt-1.5">
                  💡 图中空白日为艾宾浩斯休息日，当天无到期复习，无需学习
                </p>
              )}
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



