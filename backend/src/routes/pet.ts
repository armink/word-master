/**
 * 宠物系统 API
 *
 * GET  /api/pet/:studentId              — 获取宠物当前状态
 * POST /api/pet/:studentId/feed         — 完成今日任务后喂食（幂等，当天只计一次）
 * POST /api/pet/:studentId/snack        — 消耗零食提升饱食度
 * POST /api/pet/:studentId/earn-snack   — 答题连击奖励零食
 * GET  /api/pet/:studentId/shop         — 商店列表 + 当前金币
 * POST /api/pet/:studentId/shop/buy     — 购买商品
 * GET  /api/pet/:studentId/game/words   — 小游戏：抽取题目
 * POST /api/pet/:studentId/game/finish  — 小游戏：提交结果领奖励
 */
import { Router } from 'express'
import db from '../db/client'
import { todayInt } from './tasks'

const router = Router()

// ── 宠物成长阶段 ─────────────────────────────────────────────────
const STAGES = [
  { name: '神秘蛋', emoji: '🥚', min_words: 0 },
  { name: '幼崽',   emoji: '🐣', min_words: 10 },
  { name: '少年',   emoji: '🐥', min_words: 30 },
  { name: '青年',   emoji: '🐦', min_words: 60 },
  { name: '成年',   emoji: '🦅', min_words: 100 },
  { name: '传说',   emoji: '🦋', min_words: 200 },
]

// ── 商店物品定义 ─────────────────────────────────────────────────
export const SHOP_ITEMS = [
  { id: 1, name: '普通饭',   emoji: '🍚', cost: 10, hunger: 30, mood: 0,  desc: '填饱肚子' },
  { id: 2, name: '豪华餐',   emoji: '🍱', cost: 30, hunger: 60, mood: 10, desc: '大餐加好心情' },
  { id: 3, name: '快乐水',   emoji: '🧃', cost: 20, hunger: 0,  mood: 40, desc: '喝完超开心' },
  { id: 4, name: '营养套餐', emoji: '🥗', cost: 40, hunger: 30, mood: 30, desc: '均衡补充' },
  { id: 5, name: '生日蛋糕', emoji: '🎂', cost: 60, hunger: 50, mood: 50, desc: '豪华！全满格' },
]

// ── 气泡台词（按心情分组）────────────────────────────────────────
const SPEECHES = {
  happy: [
    '今天也要加油！💪',
    '你好厉害，我好崇拜你！',
    '和你在一起好开心呀~',
    '今天的单词都学会了吗？🌟',
    '你是最棒的学生！',
    '感觉今天特别有精神！',
    '每天学一点，越来越厉害！',
  ],
  normal: [
    '嗯嗯，继续努力！',
    '今天感觉还不错呢~',
    '我在等你来陪我哦',
    '记得来复习单词呀！',
    '一起加油吧！⭐',
    '你什么时候来看我？',
  ],
  hungry: [
    '好饿啊…你去哪里了？😢',
    '我需要你来喂我…',
    '快来完成任务吧，呜呜…',
    '肚子饿得咕咕叫…',
    '你还记得我吗？',
    '已经好久没见到你了…',
  ],
  sick: [
    '呜呜…头好痛…💫',
    '我不舒服，需要你帮我治疗…',
    '快来救我，不然我要倒下了…',
    '好难受啊…没有力气…',
  ],
}

interface PetRow {
  id: number
  student_id: number
  hunger: number
  streak_days: number
  last_fed_date: number
  shield_count: number
  snack_count: number
  total_fed: number
  coins: number
  mood_boost: number
  last_game_date: number
  created_at: number
  updated_at: number
}

/** 自动创建宠物记录（若不存在） */
function getOrCreatePet(studentId: number): PetRow {
  let pet = db.prepare('SELECT * FROM pet_status WHERE student_id = ?').get(studentId) as PetRow | undefined
  if (!pet) {
    db.prepare('INSERT INTO pet_status (student_id) VALUES (?)').run(studentId)
    pet = db.prepare('SELECT * FROM pet_status WHERE student_id = ?').get(studentId) as PetRow
  }
  return pet
}

function toDate(n: number): Date {
  const s = String(n)
  return new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`)
}

function daysSince(dateInt: number): number {
  if (!dateInt) return 0
  const today = todayInt()
  return Math.max(0, Math.floor(
    (toDate(today).getTime() - toDate(dateInt).getTime()) / 86400000
  ))
}

/** 计算当前实时饱食度（考虑时间衰减） */
function calcHunger(pet: PetRow): number {
  if (pet.last_fed_date === 0) return pet.hunger
  return Math.max(0, pet.hunger - daysSince(pet.last_fed_date) * 20)
}

/** mood_boost 随时间衰减，每天 -15 */
function calcMoodBoost(pet: PetRow): number {
  if (pet.last_fed_date === 0) return pet.mood_boost ?? 0
  return Math.max(0, (pet.mood_boost ?? 0) - daysSince(pet.last_fed_date) * 15)
}

/** 昨天的 YYYYMMDD */
function yesterdayInt(): number {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

// ── GET /:studentId ───────────────────────────────────────────────
router.get('/:studentId', (req, res) => {
  const studentId = Number(req.params.studentId)
  const student = db.prepare('SELECT id FROM students WHERE id = ?').get(studentId)
  if (!student) { res.status(404).json({ error: '学生不存在' }); return }

  const pet = getOrCreatePet(studentId)
  const today = todayInt()

  // 饱食度（实时衰减）
  const hunger = calcHunger(pet)
  const moodBoost = calcMoodBoost(pet)

  // 心情值：近 20 次答题的首次正确率 + mood_boost
  const recentStats = db.prepare(`
    SELECT COUNT(*) AS total, SUM(qa.is_correct) AS correct
    FROM (
      SELECT item_id, session_id, MIN(id) AS first_id
      FROM quiz_answers
      WHERE session_id IN (SELECT id FROM quiz_sessions WHERE student_id = ?)
      GROUP BY session_id, item_id
      LIMIT 20
    ) first_ans
    JOIN quiz_answers qa ON qa.id = first_ans.first_id
  `).get(studentId) as { total: number; correct: number }
  const baseMood = recentStats.total > 0
    ? Math.round((recentStats.correct / recentStats.total) * 100)
    : 80
  const mood = Math.min(100, baseMood + moodBoost)

  // 清洁度：积压过期词占已引入词的比例
  const introduced = (db.prepare(`
    SELECT COUNT(*) AS c FROM student_mastery WHERE student_id = ? AND introduced_date > 0
  `).get(studentId) as { c: number }).c

  const overdue = (db.prepare(`
    SELECT COUNT(*) AS c FROM student_mastery
    WHERE student_id = ? AND introduced_date > 0
      AND (
        (en_to_zh_stage > 0 AND en_to_zh_next < ? AND en_to_zh_next > 0)
        OR (zh_to_en_stage > 0 AND zh_to_en_next < ? AND zh_to_en_next > 0)
        OR (spelling_stage > 0 AND spelling_next < ? AND spelling_next > 0)
      )
  `).get(studentId, today, today, today) as { c: number }).c

  const cleanliness = introduced > 0
    ? Math.max(0, Math.round((1 - Math.min(overdue / introduced, 1)) * 100))
    : 100

  // 体力值：近 7 天答题总数（30 题/周视为满）
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 86400
  const recentActivity = (db.prepare(`
    SELECT COUNT(*) AS c FROM quiz_answers qa
    JOIN quiz_sessions qs ON qs.id = qa.session_id
    WHERE qs.student_id = ? AND qa.answered_at >= ?
  `).get(studentId, sevenDaysAgo) as { c: number }).c
  const energy = Math.min(100, Math.round((recentActivity / 30) * 100))

  // 当前成长阶段
  let stage = 0
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (introduced >= STAGES[i].min_words) { stage = i; break }
  }

  // 是否生病（饱食度和心情双低）
  const isSick = hunger < 20 || (mood < 30 && cleanliness < 30)

  // 气泡台词
  let speechKey: keyof typeof SPEECHES = 'normal'
  if (isSick) speechKey = 'sick'
  else if (hunger < 40 || mood < 40) speechKey = 'hungry'
  else if (hunger >= 70 && mood >= 70) speechKey = 'happy'
  const arr = SPEECHES[speechKey]
  const speech = arr[Math.floor(Math.random() * arr.length)]

  // 进化信息
  const nextStage = stage < STAGES.length - 1 ? STAGES[stage + 1] : null

  // 今日是否已喂食 / 已玩游戏
  const fedToday       = pet.last_fed_date  === today
  const playedGameToday = pet.last_game_date === today

  res.json({
    stage,
    stage_name:        STAGES[stage].name,
    stage_emoji:       STAGES[stage].emoji,
    hunger,
    mood,
    cleanliness,
    energy,
    streak_days:       pet.streak_days,
    shield_count:      pet.shield_count,
    snack_count:       pet.snack_count,
    coins:             pet.coins ?? 0,
    total_fed:         pet.total_fed,
    is_sick:           isSick,
    speech,
    fed_today:         fedToday,
    played_game_today: playedGameToday,
    can_evolve:        nextStage ? introduced >= nextStage.min_words : false,
    next_stage_words:  nextStage?.min_words ?? null,
    introduced_count:  introduced,
    overdue_count:     overdue,
  })
})

// ── POST /:studentId/feed ─────────────────────────────────────────
// 完成今日任务后调用，幂等（当天只记一次）
router.post('/:studentId/feed', (req, res) => {
  const studentId = Number(req.params.studentId)
  const { accuracy } = req.body as { accuracy?: number }

  const pet = getOrCreatePet(studentId)
  const today = todayInt()

  if (pet.last_fed_date === today) {
    res.json({ success: true, already_fed: true, hunger: calcHunger(pet), streak_days: pet.streak_days, coins: pet.coins ?? 0 })
    return
  }

  const currentHunger = calcHunger(pet)
  const isHighAccuracy = (accuracy ?? 0) >= 0.9
  const newHunger  = Math.min(100, currentHunger + 40 + (isHighAccuracy ? 10 : 0))
  const newStreak  = pet.last_fed_date === yesterdayInt() ? pet.streak_days + 1 : 1
  const newShields = (pet.total_fed + 1) % 20 === 0
    ? Math.min(pet.shield_count + 1, 2)
    : pet.shield_count

  // 金币：打卡 +30，高正确率 +10，连续 7 天额外 +20
  const streakBonus  = newStreak % 7 === 0 ? 20 : 0
  const coinEarned   = 30 + (isHighAccuracy ? 10 : 0) + streakBonus
  const newCoins     = (pet.coins ?? 0) + coinEarned

  db.prepare(`
    UPDATE pet_status
    SET hunger = ?, last_fed_date = ?, streak_days = ?,
        total_fed = total_fed + 1, shield_count = ?, coins = ?, updated_at = unixepoch()
    WHERE student_id = ?
  `).run(newHunger, today, newStreak, newShields, newCoins, studentId)

  res.json({
    success: true,
    already_fed:  false,
    hunger:       newHunger,
    streak_days:  newStreak,
    coins:        newCoins,
    coin_earned:  coinEarned,
    got_shield:   newShields > pet.shield_count,
    streak_bonus: streakBonus > 0,
  })
})

// ── POST /:studentId/snack ────────────────────────────────────────
router.post('/:studentId/snack', (req, res) => {
  const studentId = Number(req.params.studentId)
  const pet = getOrCreatePet(studentId)

  if (pet.snack_count <= 0) {
    res.status(400).json({ error: '没有零食了，答题连击可获得零食' })
    return
  }

  const currentHunger = calcHunger(pet)
  const newHunger = Math.min(100, currentHunger + 15)

  db.prepare(`
    UPDATE pet_status
    SET hunger = ?, snack_count = snack_count - 1, updated_at = unixepoch()
    WHERE student_id = ?
  `).run(newHunger, studentId)

  res.json({ success: true, hunger: newHunger, snack_count: pet.snack_count - 1 })
})

// ── POST /:studentId/earn-snack ───────────────────────────────────
router.post('/:studentId/earn-snack', (req, res) => {
  const studentId = Number(req.params.studentId)
  getOrCreatePet(studentId)

  db.prepare(`
    UPDATE pet_status
    SET snack_count = MIN(snack_count + 1, 9), updated_at = unixepoch()
    WHERE student_id = ?
  `).run(studentId)

  const pet = db.prepare('SELECT snack_count FROM pet_status WHERE student_id = ?').get(studentId) as { snack_count: number }
  res.json({ success: true, snack_count: pet.snack_count })
})

// ── GET /:studentId/shop ──────────────────────────────────────────
router.get('/:studentId/shop', (req, res) => {
  const studentId = Number(req.params.studentId)
  const pet = getOrCreatePet(studentId)
  res.json({ items: SHOP_ITEMS, coins: pet.coins ?? 0 })
})

// ── POST /:studentId/shop/buy ─────────────────────────────────────
router.post('/:studentId/shop/buy', (req, res) => {
  const studentId = Number(req.params.studentId)
  const { item_id } = req.body as { item_id: number }

  const item = SHOP_ITEMS.find(i => i.id === Number(item_id))
  if (!item) { res.status(400).json({ error: '商品不存在' }); return }

  const pet    = getOrCreatePet(studentId)
  const coins  = pet.coins ?? 0
  if (coins < item.cost) {
    res.status(400).json({ error: `金币不足，还差 ${item.cost - coins} 金币` })
    return
  }

  const curHunger    = calcHunger(pet)
  const curMoodBoost = calcMoodBoost(pet)
  const newHunger    = Math.min(100, curHunger + item.hunger)
  const newMoodBoost = Math.min(80, curMoodBoost + item.mood)
  const newCoins     = coins - item.cost

  db.prepare(`
    UPDATE pet_status
    SET hunger = ?, mood_boost = ?, coins = ?, updated_at = unixepoch()
    WHERE student_id = ?
  `).run(newHunger, newMoodBoost, newCoins, studentId)

  res.json({ success: true, item, hunger: newHunger, mood_boost: newMoodBoost, coins: newCoins })
})

// ── GET /:studentId/game/words ────────────────────────────────────
// 按错误率加权抽取 10-15 题，错误多/从未测试的词优先入题
router.get('/:studentId/game/words', (req, res) => {
  const studentId = Number(req.params.studentId)

  // 连同答题统计一起报出，按错误率降序排列
  const allWords = db.prepare(`
    SELECT
      i.id, i.english, i.chinese,
      COUNT(qa.id)                                                    AS total_ans,
      SUM(CASE WHEN qa.is_correct = 0 THEN 1 ELSE 0 END)             AS wrong_ans
    FROM student_mastery sm
    JOIN items i ON i.id = sm.item_id
    LEFT JOIN quiz_answers qa
      ON  qa.item_id    = i.id
      AND qa.session_id IN (SELECT id FROM quiz_sessions WHERE student_id = ?)
    WHERE sm.student_id = ? AND sm.introduced_date > 0
    GROUP BY i.id
    ORDER BY
      CASE WHEN COUNT(qa.id) = 0
           THEN 0.5
           ELSE CAST(SUM(CASE WHEN qa.is_correct = 0 THEN 1 ELSE 0 END) AS REAL) / COUNT(qa.id)
      END DESC,
      RANDOM()
  `).all(studentId, studentId) as {
    id: number; english: string; chinese: string
    total_ans: number; wrong_ans: number
  }[]

  if (allWords.length < 4) {
    res.status(400).json({ error: '已学单词不足 4 个，先去学几个单词再来玩游戏吧！' })
    return
  }

  // 题数：最多 15 题，词库不足时全部出题
  const questionCount = Math.min(15, allWords.length)
  const questions = allWords.slice(0, questionCount).map((word, idx) => {
    const pool = allWords.filter(w => w.id !== word.id)
    const distractors: string[] = []
    const used = new Set<number>()
    while (distractors.length < 3 && distractors.length < pool.length) {
      const r = Math.floor(Math.random() * pool.length)
      if (!used.has(r)) { used.add(r); distractors.push(pool[r].chinese) }
    }
    const options = [...distractors, word.chinese].sort(() => Math.random() - 0.5)
    return { index: idx, english: word.english, options, answer: word.chinese }
  })

  res.json({ questions })
})

// ── POST /:studentId/game/finish ──────────────────────────────────
// body: { correct_count, total_count }  每答对 1 题 +3 金币，满分额外 +5
router.post('/:studentId/game/finish', (req, res) => {
  const studentId = Number(req.params.studentId)
  const { correct_count, total_count } = req.body as { correct_count: number; total_count: number }

  const pet   = getOrCreatePet(studentId)
  const today = todayInt()

  if (pet.last_game_date === today) {
    res.json({ success: true, already_played: true, coins: pet.coins ?? 0 })
    return
  }

  const isPerfect    = total_count > 0 && correct_count >= total_count
  const perfectBonus = isPerfect ? 5 : 0
  const coinEarned   = correct_count * 3 + perfectBonus
  const newCoins     = (pet.coins ?? 0) + coinEarned

  // 游戏答对也提升心情
  const curBoost     = calcMoodBoost(pet)
  const newMoodBoost = Math.min(80, curBoost + correct_count * 4)

  db.prepare(`
    UPDATE pet_status
    SET coins = ?, mood_boost = ?, last_game_date = ?, updated_at = unixepoch()
    WHERE student_id = ?
  `).run(newCoins, newMoodBoost, today, studentId)

  res.json({
    success:        true,
    already_played: false,
    correct_count,
    coin_earned:    coinEarned,
    perfect:        isPerfect,
    coins:          newCoins,
  })
})

export default router
