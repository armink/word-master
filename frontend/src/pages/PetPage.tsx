import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStudent } from '@/hooks/useStudent'
import { getPetStatus, feedPet, useSnack, getShopItems, buyShopItem } from '@/api'
import type { PetStatus, ShopItem } from '@/types'

// ── 状态条组件 ────────────────────────────────────────────────────
function StatusBar({
  icon, label, value, color,
}: {
  icon: string; label: string; value: number
  color: 'green' | 'blue' | 'yellow' | 'purple'
}) {
  const colorMap = {
    green:  { bar: 'bg-green-400',  bg: 'bg-green-50',  text: 'text-green-600' },
    blue:   { bar: 'bg-blue-400',   bg: 'bg-blue-50',   text: 'text-blue-600'  },
    yellow: { bar: 'bg-yellow-400', bg: 'bg-yellow-50', text: 'text-yellow-600' },
    purple: { bar: 'bg-purple-400', bg: 'bg-purple-50', text: 'text-purple-600' },
  }
  const c = colorMap[color]
  const pct = Math.max(0, Math.min(100, value))
  const barColor = pct < 25 ? 'bg-red-400' : pct < 50 ? 'bg-orange-400' : c.bar

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${c.bg}`}>
      <span className="text-base w-5 text-center">{icon}</span>
      <span className={`text-xs font-medium w-12 shrink-0 ${c.text}`}>{label}</span>
      <div className="flex-1 h-2.5 bg-white/60 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-bold w-8 text-right ${c.text}`}>{pct}</span>
    </div>
  )
}

// ── 宠物动画类名 ──────────────────────────────────────────────────
function petAnimClass(pet: PetStatus): string {
  if (pet.is_sick) return 'animate-pet-shiver'
  if (pet.hunger < 40 || pet.mood < 40) return 'animate-pet-wobble'
  if (pet.hunger >= 70 && pet.mood >= 70) return 'animate-pet-bounce'
  return 'animate-pet-float'
}

// ── 进化阶段进度条 ────────────────────────────────────────────────
const STAGE_THRESHOLDS = [0, 10, 30, 60, 100, 200]
const STAGE_EMOJIS = ['🥚', '🐣', '🐥', '🐦', '🦅', '🦋']

function StageProgress({ introduced, stage }: { introduced: number; stage: number }) {
  const currentMin = STAGE_THRESHOLDS[stage]
  const nextMin = STAGE_THRESHOLDS[stage + 1] ?? null
  const pct = nextMin
    ? Math.min(100, Math.round(((introduced - currentMin) / (nextMin - currentMin)) * 100))
    : 100

  return (
    <div className="px-4 py-3 bg-white rounded-2xl shadow-sm border border-gray-100">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs text-gray-500">成长进度</span>
        <span className="text-xs text-gray-400">
          {nextMin ? `${introduced} / ${nextMin} 词 → ${STAGE_EMOJIS[stage + 1] ?? ''}` : '已达最高阶段 🎊'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-base">{STAGE_EMOJIS[stage]}</span>
        <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary-400 to-primary-600 rounded-full transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-base">{STAGE_EMOJIS[Math.min(stage + 1, 5)]}</span>
      </div>
    </div>
  )
}

// ── 商店 Sheet 组件 ───────────────────────────────────────────────
function ShopSheet({
  studentId, coins, onClose, onPurchase,
}: {
  studentId: number; coins: number
  onClose: () => void
  onPurchase: (newCoins: number, newHunger: number) => void
}) {
  const [items, setItems] = useState<ShopItem[]>([])
  const [buying, setBuying] = useState<number | null>(null)
  const [shopCoins, setShopCoins] = useState(coins)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    getShopItems(studentId).then(d => setItems(d.items))
  }, [studentId])

  const handleBuy = async (item: ShopItem) => {
    if (shopCoins < item.cost) { setMsg(`金币不足 ${item.cost - shopCoins} 枚`); return }
    setBuying(item.id)
    try {
      const r = await buyShopItem(studentId, item.id)
      setShopCoins(r.coins)
      setMsg(`${item.emoji} ${item.name} 购买成功！`)
      onPurchase(r.coins, r.hunger)
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBuying(null)
    }
  }

  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl p-5 pb-10 animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* 标题行 */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">🛒 宠物商店</h2>
          <div className="flex items-center gap-1.5 bg-yellow-50 px-3 py-1 rounded-full">
            <span className="text-base">🪙</span>
            <span className="text-sm font-bold text-yellow-600">{shopCoins}</span>
          </div>
        </div>

        {/* 提示消息 */}
        {msg && (
          <div className="mb-3 text-center text-sm text-primary-600 bg-primary-50 rounded-xl py-2">{msg}</div>
        )}

        {/* 商品列表 */}
        <div className="grid grid-cols-1 gap-2">
          {items.map(item => {
            const afford = shopCoins >= item.cost
            return (
              <button
                key={item.id}
                disabled={buying !== null}
                onClick={() => handleBuy(item)}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all active:scale-[0.98]
                  ${ afford
                    ? 'bg-white border-gray-200 shadow-sm'
                    : 'bg-gray-50 border-gray-100 opacity-60'
                  } ${ buying === item.id ? 'opacity-70' : '' }`}
              >
                <span className="text-3xl">{item.emoji}</span>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-gray-800 text-sm">{item.name}</p>
                  <p className="text-xs text-gray-400">{item.desc}{item.hunger > 0 ? `  饱食度+${item.hunger}` : ''}{item.mood > 0 ? `  心情+${item.mood}` : ''}</p>
                </div>
                <div className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm font-bold ${ afford ? 'bg-yellow-50 text-yellow-600' : 'bg-gray-100 text-gray-400' }`}>
                  <span>🪙</span>
                  <span>{item.cost}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── 主页面 ────────────────────────────────────────────────────────
export default function PetPage() {
  const { student } = useStudent()
  const navigate = useNavigate()
  const [pet, setPet] = useState<PetStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [feedAnim, setFeedAnim] = useState(false)
  const [snackAnim, setSnackAnim] = useState(false)
  const [tapAnim, setTapAnim] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [speechVisible, setSpeechVisible] = useState(true)
  const [showShop, setShowShop] = useState(false)

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 2500)
  }, [])

  const load = useCallback(async () => {
    if (!student) return
    setLoading(true)
    try {
      const data = await getPetStatus(student.id)
      setPet(data)
    } finally {
      setLoading(false)
    }
  }, [student])

  useEffect(() => { load() }, [load])

  const handleFeed = async () => {
    if (!student || !pet) return
    setFeedAnim(true)
    setTimeout(() => setFeedAnim(false), 800)
    try {
      const result = await feedPet(student.id)
      if (result.already_fed) {
        showToast('今天已经喂过啦！完成任务后可以再喂 🌟')
      } else {
        showToast(`喂食成功！饱食度 +40 🍖  +${result.coin_earned ?? 30} 金币`)
        await load()
      }
    } catch (e) {
      showToast((e as Error).message)
    }
  }

  const handleSnack = async () => {
    if (!student || !pet) return
    if (pet.snack_count <= 0) {
      showToast('没有零食了，答题连击5题可获得零食 🎮')
      return
    }
    setSnackAnim(true)
    setTimeout(() => setSnackAnim(false), 600)
    try {
      const result = await useSnack(student.id)
      showToast(`零食喂完！饱食度 +15 🍬`)
      setPet(prev => prev ? { ...prev, hunger: result.hunger, snack_count: result.snack_count } : prev)
    } catch (e) {
      showToast((e as Error).message)
    }
  }

  const handleBath = () => {
    if (!pet || pet.overdue_count === 0) {
      showToast('没有积压的单词，宠物很干净！🛁')
      return
    }
    navigate('/tasks')
  }

  if (!student) {
    return (
      <div className="p-8 text-center text-gray-400 pt-20">
        <p className="text-4xl mb-4">🐾</p>
        <p>请先在首页选择学生</p>
      </div>
    )
  }

  if (loading && !pet) {
    return (
      <div className="p-8 text-center pt-20">
        <p className="text-5xl mb-4 animate-bounce">🥚</p>
        <p className="text-gray-400 text-sm">宠物苏醒中…</p>
      </div>
    )
  }

  if (!pet) return null

  const moodBg = pet.is_sick
    ? 'from-gray-100 to-gray-200'
    : pet.hunger < 40
    ? 'from-orange-50 to-yellow-50'
    : pet.hunger >= 70 && pet.mood >= 70
    ? 'from-green-50 to-emerald-50'
    : 'from-blue-50 to-indigo-50'

  return (
    <div className="p-4 pb-32">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-4 left-4 right-4 z-50 bg-gray-800 text-white text-sm px-4 py-3 rounded-2xl text-center shadow-xl animate-fade-in">
          {toastMsg}
        </div>
      )}

      {/* 顶部信息栏 */}
      <div className="flex items-center justify-between pt-4 mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">我的宠物</h1>
          <p className="text-xs text-gray-400">{pet.stage_name} · 第 {pet.stage} 阶段</p>
        </div>
        <div className="flex items-center gap-2">
          {/* 金币 */}
          <div className="flex items-center gap-1 bg-yellow-50 px-3 py-1.5 rounded-full">
            <span className="text-base">🪙</span>
            <span className="text-sm font-bold text-yellow-500">{pet.coins}</span>
          </div>
          {/* 连续打卡 */}
          <div className="flex items-center gap-1 bg-orange-50 px-3 py-1.5 rounded-full">
            <span className="text-base">🔥</span>
            <span className="text-sm font-bold text-orange-500">{pet.streak_days}</span>
            <span className="text-xs text-orange-400">天</span>
          </div>
          {/* 保护符 */}
          {pet.shield_count > 0 && (
            <div className="flex items-center gap-1 bg-indigo-50 px-3 py-1.5 rounded-full">
              <span className="text-base">🛡️</span>
              <span className="text-sm font-bold text-indigo-500">×{pet.shield_count}</span>
            </div>
          )}
        </div>
      </div>

      {/* 宠物主展示区 */}
      <div className={`relative rounded-3xl bg-gradient-to-br ${moodBg} p-6 mb-4 text-center overflow-hidden`}>
        {/* 背景装饰 */}
        <div className="absolute top-2 left-4 text-2xl opacity-20">✨</div>
        <div className="absolute top-4 right-6 text-xl opacity-20">⭐</div>
        <div className="absolute bottom-3 left-8 text-lg opacity-20">🌿</div>

        {/* 生病状态遮罩 */}
        {pet.is_sick && (
          <div className="absolute inset-0 bg-gray-400/10 rounded-3xl flex items-center justify-center pointer-events-none">
            <span className="text-4xl opacity-30">💫</span>
          </div>
        )}

        {/* 气泡台词 — 纯展示 */}
        <div className="relative inline-block mb-4">
          {speechVisible && (
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl px-4 py-2 shadow-sm text-sm text-gray-700 font-medium max-w-[220px] animate-speech-pop">
              {pet.speech}
            </div>
          )}
          {/* 气泡三角 */}
          <div className="absolute left-1/2 -bottom-2 -translate-x-1/2 w-0 h-0
            border-l-[6px] border-l-transparent
            border-r-[6px] border-r-transparent
            border-t-[8px] border-t-white/90" />
        </div>

        {/* 宠物 Emoji — 点击换台词+弹跳 */}
        <div
          onClick={async () => {
            if (tapAnim) return
            setTapAnim(true)
            setSpeechVisible(false)
            setTimeout(() => setTapAnim(false), 800)
            await load()
            setSpeechVisible(true)
          }}
          className={`text-8xl leading-none mb-2 cursor-pointer select-none
            ${tapAnim ? 'animate-pet-tap' : petAnimClass(pet)}
            ${feedAnim ? 'scale-125 transition-transform' : ''}
            ${snackAnim ? 'scale-110 transition-transform' : ''}
          `}
        >
          {pet.is_sick ? '🤒' : pet.stage_emoji}
        </div>

        {/* 状态标签 */}
        <div className="flex justify-center gap-2 mt-2">
          {pet.is_sick && (
            <span className="text-xs bg-red-100 text-red-500 px-2 py-0.5 rounded-full font-medium">😵 生病了</span>
          )}
          {!pet.is_sick && pet.hunger >= 80 && (
            <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-medium">😊 心情很好</span>
          )}
          {!pet.is_sick && pet.hunger < 30 && (
            <span className="text-xs bg-orange-100 text-orange-500 px-2 py-0.5 rounded-full font-medium">😢 好饿好饿</span>
          )}
          {pet.fed_today && (
            <span className="text-xs bg-primary-100 text-primary-600 px-2 py-0.5 rounded-full font-medium">✓ 今日已喂食</span>
          )}
          {pet.can_evolve && (
            <span className="text-xs bg-yellow-100 text-yellow-600 px-2 py-0.5 rounded-full font-medium animate-pulse">🌟 可以进化！</span>
          )}
        </div>
      </div>

      {/* 状态条 */}
      <div className="flex flex-col gap-2 mb-4">
        <StatusBar icon="🍖" label="饱食度" value={pet.hunger}     color="green"  />
        <StatusBar icon="😊" label="心情值"  value={pet.mood}       color="blue"   />
        <StatusBar icon="🛁" label="清洁度"  value={pet.cleanliness} color="yellow" />
        <StatusBar icon="⚡" label="体力值"  value={pet.energy}     color="purple" />
      </div>

      {/* 成长进度 */}
      <div className="mb-4">
        <StageProgress introduced={pet.introduced_count} stage={pet.stage} />
      </div>

      {/* 生病诊断卡（仅生病时显示）*/}
      {pet.is_sick && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-2xl p-4">
          <p className="font-semibold text-red-600 mb-2 flex items-center gap-1.5">
            <span>🏥</span> 宠物病了，需要治疗！
          </p>
          <div className="space-y-1.5 text-xs text-red-500 mb-3">
            {pet.mood < 30 && (
              <p>• <span className="font-medium">心情太差（{pet.mood}）</span>：最近答题正确率低，多做练习提升心情</p>
            )}
            {pet.cleanliness < 30 && (
              <p>• <span className="font-medium">积灰太多（{pet.cleanliness}）</span>：有 {pet.overdue_count} 个单词过期未复习</p>
            )}
            {pet.hunger < 20 && (
              <p>• <span className="font-medium">饿坏了（{pet.hunger}）</span>：好几天没有打卡了</p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/tasks')}
              className="flex-1 bg-red-500 text-white text-sm py-2.5 rounded-xl font-semibold active:opacity-80"
            >
              💊 去完成今日任务
            </button>
          </div>
        </div>
      )}

      {/* 操作按钮 - 2x2 grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* 喂食 */}
        <button
          onClick={handleFeed}
          className={`flex flex-col items-center gap-1.5 py-4 rounded-2xl font-medium text-sm transition-all active:scale-95
            ${pet.fed_today
              ? 'bg-gray-100 text-gray-400'
              : 'bg-green-50 text-green-600 shadow-sm border border-green-100'
            }`}
        >
          <span className="text-2xl">🍖</span>
          <span className="text-xs">{pet.fed_today ? '已喂食' : '喂食'}</span>
        </button>

        {/* 洗澡 */}
        <button
          onClick={handleBath}
          className={`flex flex-col items-center gap-1.5 py-4 rounded-2xl font-medium text-sm transition-all active:scale-95
            ${pet.overdue_count > 0
              ? 'bg-yellow-50 text-yellow-600 shadow-sm border border-yellow-100'
              : 'bg-gray-100 text-gray-400'
            }`}
        >
          <span className="text-2xl">🚿</span>
          <span className="text-xs">
            {pet.overdue_count > 0 ? `${pet.overdue_count} 词过期` : '很干净'}
          </span>
        </button>

        {/* 零食 */}
        <button
          onClick={handleSnack}
          className={`flex flex-col items-center gap-1.5 py-4 rounded-2xl font-medium text-sm transition-all active:scale-95
            ${pet.snack_count > 0
              ? 'bg-pink-50 text-pink-600 shadow-sm border border-pink-100'
              : 'bg-gray-100 text-gray-400'
            }`}
        >
          <span className="text-2xl">🍬</span>
          <span className="text-xs">零食 ×{pet.snack_count}</span>
        </button>

        {/* 商店 */}
        <button
          onClick={() => setShowShop(true)}
          className="flex flex-col items-center gap-1.5 py-4 rounded-2xl font-medium text-sm bg-yellow-50 text-yellow-600 shadow-sm border border-yellow-100 transition-all active:scale-95"
        >
          <span className="text-2xl">🛒</span>
          <span className="text-xs">商店</span>
        </button>
      </div>

      {/* 小游戏入口 */}
      <button
        onClick={() => { if (!pet.played_game_today) navigate('/pet/game') }}
        className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl mb-5 transition-all
          ${pet.played_game_today
            ? 'bg-gray-100 text-gray-400 cursor-default'
            : 'bg-gradient-to-r from-purple-50 to-indigo-50 text-purple-700 shadow-sm border border-purple-100 active:scale-[0.98]'
          }`}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">🃏</span>
          <div className="text-left">
            <p className="font-semibold text-sm">
              {pet.played_game_today ? '今日游戏已完成' : '每日闪卡小游戏'}
            </p>
            <p className="text-xs opacity-60">
              {pet.played_game_today ? '明天再来' : '优先弱词，最多15题 · 答对+3金币'}
            </p>
          </div>
        </div>
        {!pet.played_game_today && <span className="text-purple-400 text-lg">›</span>}
      </button>

      {/* 小贴士 */}
      <div className="bg-primary-50 rounded-2xl p-4 text-xs text-primary-600 space-y-1.5">
        <p className="font-semibold text-primary-700 mb-2">💡 喂养指南</p>
        <p>• 每天完成今日任务即可喂食，饱食度 +40，金币 +30</p>
        <p>• 答题正确率 ≥90%，额外奖励 +10 金币</p>
        <p>• 连续 7 天打卡奖励 +20 金币 🎉</p>
        <p>• 答题连击 5 题，奖励一个零食 🍬</p>
        <p>• 点「洗澡」去清理积压的过期单词，提升清洁度</p>
        <p>• 每日闪卡游戏：优先考错误多的词，最多15题，答对1题+3金币，满分+5</p>
        <p>• 饱食度或（心情+清洁度）过低时宠物会生病，完成任务可康复</p>
        <p>• 体力值 = 近 7 天答题数，每周答 30 题即满格，不练习会自然下降</p>
      </div>

      {/* 商店 Sheet */}
      {showShop && student && (
        <ShopSheet
          studentId={student.id}
          coins={pet.coins}
          onClose={() => setShowShop(false)}
          onPurchase={(newCoins, newHunger) => {
            setPet(prev => prev ? { ...prev, coins: newCoins, hunger: newHunger } : prev)
          }}
        />
      )}
    </div>
  )
}
