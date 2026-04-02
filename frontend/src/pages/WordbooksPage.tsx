import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getWordbooks, createWordbook, deleteWordbook } from '@/api'
import type { Wordbook } from '@/types'
import { useWordbook } from '@/hooks/useWordbook'

export default function WordbooksPage() {
  const navigate = useNavigate()
  const { wordbook: currentWb, setWordbook } = useWordbook()
  const [wordbooks, setWordbooks] = useState<Wordbook[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 长按删除相关
  const [menuWb, setMenuWb] = useState<Wordbook | null>(null)       // 长按弹出的操作菜单
  const [confirmWb, setConfirmWb] = useState<Wordbook | null>(null) // 二次确认删除
  const [confirmHasData, setConfirmHasData] = useState(false)       // 是否有学习数据
  const [deleting, setDeleting] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 记录是否触发了长按菜单，用于 onTouchEnd 判断是否应该导航
  const longPressTriggeredRef = useRef(false)
  // 卡片列表容器 ref，用于添加原生非被动 touchstart 拦截长按系统菜单
  const cardsContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getWordbooks()
      .then(setWordbooks)
      .finally(() => setLoading(false))
  }, [])

  // 在每张卡片元素上注册原生 { passive: false } touchstart，阻断 Android Chrome 长按「标记为广告」
  // 关键：
  //   1. 必须绑在元素本身（不是父容器），否则 closest() 会漏掉 div padding 区域
  //   2. deps 用 [wordbooks]——首次渲染时 loading=true，卡片 DOM 还不存在；
  //      useEffect([]) 那一刻 ref.current=null，监听器永远不会被添加
  //   3. 必须原生注册——React 合成事件在 passive:true 下 preventDefault 被浏览器静默忽略
  //   4. capture:true 关键——使处理器在捕获阶段触发（从父到子），即在事件到达
  //      任何子按钮之前就调用 preventDefault，阻止浏览器启动对按钮的长按识别
  useEffect(() => {
    const el = cardsContainerRef.current
    if (!el) return
    const prevent = (e: TouchEvent) => e.preventDefault()
    const cards = el.querySelectorAll<HTMLElement>('[data-card]')
    cards.forEach(card => card.addEventListener('touchstart', prevent, { capture: true, passive: false }))
    return () => cards.forEach(card => card.removeEventListener('touchstart', prevent, { capture: true }))
  }, [wordbooks])

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

  const startLongPress = (wb: Wordbook) => {
    longPressTriggeredRef.current = false
    longPressTimer.current = setTimeout(() => {
      longPressTriggeredRef.current = true
      setMenuWb(wb)
    }, 500)
  }
  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }

  const handleDeleteRequest = async (wb: Wordbook) => {
    setMenuWb(null)
    try {
      const result = await deleteWordbook(wb.id)
      if (result === null) {
        // 直接删除成功（无学习数据）
        setWordbooks(prev => prev.filter(w => w.id !== wb.id))
        if (currentWb?.id === wb.id) setWordbook(null)
      } else if (result.has_data) {
        setConfirmHasData(true)
        setConfirmWb(wb)
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const handleForceDelete = async () => {
    if (!confirmWb) return
    setDeleting(true)
    try {
      await deleteWordbook(confirmWb.id, true)
      setWordbooks(prev => prev.filter(w => w.id !== confirmWb.id))
      if (currentWb?.id === confirmWb.id) setWordbook(null)
      setConfirmWb(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDeleting(false)
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
        <div ref={cardsContainerRef} className="space-y-3">
          {wordbooks.map(wb => (
            <div
              key={wb.id}
              data-card
              className={`w-full bg-white rounded-2xl p-4 shadow-sm border-2 transition-colors select-none touch-none ${
                currentWb?.id === wb.id ? 'border-primary-400 bg-primary-50' : 'border-gray-100'
              }`}
              onContextMenu={e => e.preventDefault()}
              onTouchStart={() => startLongPress(wb)}
              onTouchEnd={cancelLongPress}
              onTouchMove={cancelLongPress}
              onMouseDown={() => startLongPress(wb)}
              onMouseUp={cancelLongPress}
              onMouseLeave={cancelLongPress}
            >
              <div className="flex items-center justify-between">
                <button
                  className="flex-1 min-w-0 text-left"
                  onClick={() => navigate(`/wordbooks/${wb.id}`)}
                  onTouchEnd={() => {
                    if (!longPressTriggeredRef.current) navigate(`/wordbooks/${wb.id}`)
                  }}
                >
                  <p className="font-semibold text-gray-800 truncate">
                    {currentWb?.id === wb.id && <span className="text-primary-500 mr-1">▶</span>}
                    {wb.name}
                  </p>
                  {wb.description && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{wb.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">{wb.item_count} 个词条</p>
                </button>
                <button
                  onClick={() => setWordbook(currentWb?.id === wb.id ? null : wb)}
                  onTouchEnd={() => {
                    if (!longPressTriggeredRef.current) setWordbook(currentWb?.id === wb.id ? null : wb)
                  }}
                  className={`ml-3 shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    currentWb?.id === wb.id
                      ? 'bg-primary-500 text-white border-primary-500'
                      : 'text-primary-600 border-primary-300'
                  }`}
                >
                  {currentWb?.id === wb.id ? '当前' : '设为当前'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 长按操作菜单 */}
      {menuWb && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setMenuWb(null)}>
          <div className="bg-white w-full max-w-md rounded-t-3xl pb-8" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-5 pb-3 border-b border-gray-100">
              <p className="font-semibold text-gray-800 truncate">{menuWb.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">{menuWb.item_count} 个词条</p>
            </div>
            <div className="px-4 pt-3 space-y-2">
              <button
                onClick={() => handleDeleteRequest(menuWb)}
                className="w-full py-3 rounded-2xl bg-red-50 text-red-600 font-semibold active:scale-95 transition-transform"
              >
                🗑️ 删除单词本
              </button>
              <button
                onClick={() => setMenuWb(null)}
                className="w-full py-3 rounded-2xl bg-gray-100 text-gray-600 font-semibold active:scale-95 transition-transform"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 有学习数据的二次确认弹窗 */}
      {confirmWb && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl">
            <p className="text-lg font-bold text-gray-800 mb-2">⚠️ 确认删除？</p>
            <p className="text-sm text-gray-600 mb-1">「{confirmWb.name}」含有学习进度数据。</p>
            <p className="text-sm text-red-500 mb-5">删除后所有学习记录、掌握度和复习计划将<strong>无法恢复</strong>。</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleForceDelete}
                disabled={deleting}
                className="w-full py-3 rounded-2xl bg-red-500 text-white font-bold disabled:opacity-50 active:scale-95 transition-transform"
              >
                {deleting ? '删除中…' : '确认删除（含学习数据）'}
              </button>
              <button
                onClick={() => setConfirmWb(null)}
                disabled={deleting}
                className="w-full py-3 rounded-2xl bg-gray-100 text-gray-600 font-semibold active:scale-95 transition-transform"
              >
                取消
              </button>
            </div>
          </div>
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


