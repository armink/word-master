/**
 * 穷举交叉语义测试
 *
 * 把 seed.ts 所有词汇两两互测，暴露所有潜在误判（false positive）。
 * 同时对比两种匹配策略：
 *   A. 当前策略：直接比较中文词
 *   B. 例句策略：用完整例句对比（利用更多上下文，通常区分度更好）
 *
 * 运行: npx tsx scripts/cross-test.ts [--threshold 0.76]
 */
import { pipeline, cos_sim, env } from '@xenova/transformers'

env.remoteHost = 'https://hf-mirror.com'

// ──────────────────────────────────────────────────────────────
// 词汇数据（从 seed.ts 提取，含例句用于方案 B 对比）
// ──────────────────────────────────────────────────────────────
const WORDS = [
  { en: 'beautiful',   zh: '美丽',   sen_zh: '多美丽的花园！',         sen_en: 'What a beautiful garden!' },
  { en: 'ugly',        zh: '丑陋',   sen_zh: '那栋老房子看起来很丑陋', sen_en: 'The old house looks ugly.' },
  { en: 'cute',        zh: '可爱',   sen_zh: '这只小狗好可爱',         sen_en: 'The puppy is so cute.' },
  { en: 'clean',       zh: '干净',   sen_zh: '保持房间干净',           sen_en: 'Keep your room clean.' },
  { en: 'dirty',       zh: '脏',     sen_zh: '别碰那面脏墙',           sen_en: 'Do not touch the dirty wall.' },
  { en: 'happy',       zh: '快乐',   sen_zh: '我今天感到快乐',         sen_en: 'I feel happy today.' },
  { en: 'sad',         zh: '悲伤',   sen_zh: '听到消息后她感到悲伤',   sen_en: 'She felt sad after the news.' },
  { en: 'angry',       zh: '愤怒',   sen_zh: '他对这个错误感到愤怒',   sen_en: 'He was angry at the mistake.' },
  { en: 'scared',      zh: '害怕',   sen_zh: '我害怕黑暗',             sen_en: 'I am scared of the dark.' },
  { en: 'nervous',     zh: '紧张',   sen_zh: '考试前我感到紧张',       sen_en: 'I feel nervous before exams.' },
  { en: 'excited',     zh: '兴奋',   sen_zh: '孩子们很兴奋',           sen_en: 'The kids are excited.' },
  { en: 'shy',         zh: '害羞',   sen_zh: '她在课堂上很害羞',       sen_en: 'She is shy in class.' },
  { en: 'proud',       zh: '自豪',   sen_zh: '我为你感到自豪',         sen_en: 'I am proud of you.' },
  { en: 'lonely',      zh: '孤独',   sen_zh: '他晚上感到孤独',         sen_en: 'He felt lonely at night.' },
  { en: 'tired',       zh: '疲惫',   sen_zh: '跑步后我感到疲惫',       sen_en: 'I am tired after the run.' },
  { en: 'brave',       zh: '勇敢',   sen_zh: '勇敢地再试一次',         sen_en: 'Be brave and try again.' },
  { en: 'clever',      zh: '聪明',   sen_zh: '她是个聪明的学生',       sen_en: 'She is a clever student.' },
  { en: 'lazy',        zh: '懒惰',   sen_zh: '学习上不要懒惰',         sen_en: 'Do not be lazy about studying.' },
  { en: 'polite',      zh: '礼貌',   sen_zh: '对别人要一直有礼貌',     sen_en: 'Always be polite to others.' },
  { en: 'gentle',      zh: '温柔',   sen_zh: '对婴儿要温柔',           sen_en: 'Be gentle with the baby.' },
  { en: 'generous',    zh: '慷慨',   sen_zh: '他送礼物很慷慨',         sen_en: 'He is generous with gifts.' },
  { en: 'patient',     zh: '耐心',   sen_zh: '好老师很有耐心',         sen_en: 'A good teacher is patient.' },
  { en: 'curious',     zh: '好奇',   sen_zh: '孩子天生好奇',           sen_en: 'Children are naturally curious.' },
  { en: 'quiet',       zh: '安静',   sen_zh: '上课请保持安静',         sen_en: 'Please keep quiet in class.' },
  { en: 'noisy',       zh: '吵闹',   sen_zh: '这条街非常吵闹',         sen_en: 'The street is very noisy.' },
  { en: 'careful',     zh: '小心',   sen_zh: '上楼梯要小心',           sen_en: 'Be careful on the stairs.' },
  { en: 'strange',     zh: '奇怪',   sen_zh: '那是个奇怪的声音',       sen_en: "That's a strange sound." },
  { en: 'important',   zh: '重要',   sen_zh: '健康非常重要',           sen_en: 'Health is very important.' },
  { en: 'difficult',   zh: '困难',   sen_zh: '这道题很困难',           sen_en: 'The puzzle is difficult.' },
  { en: 'courage',     zh: '勇气',   sen_zh: '尝试需要勇气',           sen_en: 'It takes courage to try.' },
  { en: 'wisdom',      zh: '智慧',   sen_zh: '奶奶有很大的智慧',       sen_en: 'Grandma has great wisdom.' },
  { en: 'friendship',  zh: '友谊',   sen_zh: '我们的友谊很牢固',       sen_en: 'Our friendship is strong.' },
  { en: 'adventure',   zh: '冒险',   sen_zh: '每天都是一场冒险',       sen_en: 'Every day is an adventure.' },
]

const THRESHOLD = parseFloat(process.argv.find(a => a.startsWith('--threshold'))?.split('=')[1] ?? '0.76')

// ──────────────────────────────────────────────────────────────

type Pipeline = (input: string, opts: Record<string, unknown>) => Promise<{ data: Float32Array }>

async function loadModel(): Promise<Pipeline> {
  process.stdout.write('[加载模型] paraphrase-multilingual-MiniLM-L12-v2 ...')
  const m = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2') as unknown as Pipeline
  console.log(' 完成')
  return m
}

async function embed(model: Pipeline, text: string): Promise<number[]> {
  const out = await model(text, { pooling: 'mean', normalize: true })
  return Array.from(out.data)
}

function sim(a: number[], b: number[]): number {
  return cos_sim(a, b) as unknown as number
}

// ──────────────────────────────────────────────────────────────

async function main() {
  const model = await loadModel()
  const n = WORDS.length

  console.log(`\n计算 ${n} 个词汇的嵌入向量（共 ${n} 次）...`)

  // 并发嵌入两种表示
  const zhVecs: number[][] = []
  const senVecs: number[][] = []  // 例句向量
  for (const w of WORDS) {
    zhVecs.push(await embed(model, w.zh))
    senVecs.push(await embed(model, w.sen_zh))
    process.stdout.write('.')
  }
  console.log(' 完成\n')

  // 两两计算相似度，找出 >= threshold 的 "误判候选"
  type Pair = { a: string; b: string; scoreZh: number; scoreSen: number }
  const falsePositives: Pair[] = []

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const scoreZh  = sim(zhVecs[i],  zhVecs[j])
      const scoreSen = sim(senVecs[i], senVecs[j])
      if (scoreZh >= THRESHOLD || scoreSen >= THRESHOLD) {
        falsePositives.push({
          a: WORDS[i].zh,
          b: WORDS[j].zh,
          scoreZh,
          scoreSen,
        })
      }
    }
  }

  falsePositives.sort((x, y) => y.scoreZh - x.scoreZh)

  // ── 输出报告 ──────────────────────────────────────────────
  console.log('═'.repeat(72))
  console.log(`  穷举交叉测试报告  (阈值=${THRESHOLD}, 词汇数=${n})`)
  console.log('═'.repeat(72))
  console.log(`  找到 ${falsePositives.length} 对得分 ≥ ${THRESHOLD} 的互不相同词组合\n`)

  if (falsePositives.length === 0) {
    console.log('  ✅ 没有潜在误判！当前模型+阈值对 seed 词汇已完全正确。')
  } else {
    console.log('  【策略A：直接比中文词】  【策略B：比中文例句】')
    console.log('  ' + '─'.repeat(68))
    for (const p of falsePositives) {
      const zA = p.scoreZh  >= THRESHOLD ? '❌' : '✅'
      const zB = p.scoreSen >= THRESHOLD ? '❌' : '✅'
      console.log(
        `  ${zA} A=${p.scoreZh.toFixed(3)}  ${zB} B=${p.scoreSen.toFixed(3)}` +
        `  |  "${p.a}" ↔ "${p.b}"`
      )
    }
  }

  // ── 阈值敏感性分析 ────────────────────────────────────────
  console.log()
  console.log('─'.repeat(72))
  console.log('  阈值敏感性（同阈值下，策略A vs 策略B 的误判数）')
  console.log('  ' + '─'.repeat(68))

  // 收集所有对的分数
  const allZh:  number[] = []
  const allSen: number[] = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      allZh.push(sim(zhVecs[i], zhVecs[j]))
      allSen.push(sim(senVecs[i], senVecs[j]))
    }
  }

  for (const t of [0.70, 0.72, 0.74, 0.76, 0.78, 0.80, 0.82, 0.85]) {
    const fpZh  = allZh.filter(s => s >= t).length
    const fpSen = allSen.filter(s => s >= t).length
    const marker = t === THRESHOLD ? ' ← 当前' : ''
    console.log(`  t=${t.toFixed(2)}: 策略A 误判候选=${String(fpZh).padStart(3)}  策略B 误判候选=${String(fpSen).padStart(3)}${marker}`)
  }

  // ── 策略 C：例句 vs 单词（真实场景：standard用例句，user用短词）─────
  // 验证：(1) 真近义词能否通过，(2) 误判能否消除
  type CaseC = { standard: string; userInput: string; senZh: string; expect: boolean; note: string }
  const CASES_C: CaseC[] = [
    // 真近义词（期望 match=true）
    { standard: '快乐', senZh: '我今天感到快乐',       userInput: '高兴', expect: true,  note: 'happy 近义 高兴' },
    { standard: '快乐', senZh: '我今天感到快乐',       userInput: '开心', expect: true,  note: 'happy 近义 开心' },
    { standard: '愤怒', senZh: '他对这个错误感到愤怒', userInput: '生气', expect: true,  note: 'angry 近义 生气' },
    { standard: '美丽', senZh: '多美丽的花园',         userInput: '漂亮', expect: true,  note: 'beautiful 近义 漂亮' },
    { standard: '美丽', senZh: '多美丽的花园',         userInput: '好看', expect: true,  note: 'beautiful 近义 好看' },
    { standard: '小心', senZh: '上楼梯要小心',         userInput: '仔细', expect: true,  note: 'careful 近义 仔细' },
    // 历史误判（期望 match=false）
    { standard: '快乐', senZh: '我今天感到快乐',       userInput: '兴奋', expect: false, note: 'happy vs 兴奋（历史FP）' },
    { standard: '快乐', senZh: '我今天感到快乐',       userInput: '自豪', expect: false, note: 'happy vs 自豪（历史FP）' },
    { standard: '快乐', senZh: '我今天感到快乐',       userInput: '特殊的', expect: false, note: 'happy vs 特殊的（历史FP）' },
    { standard: '吵闹', senZh: '这条街非常吵闹',       userInput: '浮躁', expect: false, note: 'noisy vs 浮躁（临界FP 0.773）' },
    { standard: '温柔', senZh: '对婴儿要温柔',         userInput: '小气', expect: false, note: 'gentle vs 小气（历史FP）' },
    { standard: '小心', senZh: '上楼梯要小心',         userInput: '夸张', expect: false, note: 'careful vs 夸张（历史FP）' },
    { standard: '奇怪', senZh: '那是个奇怪的声音',     userInput: '难过', expect: false, note: 'strange vs 难过（历史FP）' },
    { standard: '重要', senZh: '健康非常重要',         userInput: '好处', expect: false, note: 'important vs 好处（历史FP）' },
    { standard: '可爱', senZh: '这只小狗好可爱',       userInput: '形象', expect: false, note: 'cute vs 形象（历史FP）' },
  ]

  console.log('\n策略C 验证（例句作为标准侧，短词作为用户侧）\n')
  console.log('  ' + '─'.repeat(68))

  // 对策略C，扫描多个候选阈值
  const thresholds_c = [0.60, 0.65, 0.70, 0.75, 0.76]
  for (const w of CASES_C) {
    const sVec = await embed(model, w.senZh)
    const uVec = await embed(model, w.userInput)
    const s    = sim(sVec, uVec)
    const results = thresholds_c.map(t => `t=${t.toFixed(2)}:${s >= t ? '✅' : '❌'}`).join('  ')
    const tag = w.expect ? '▲' : '▼'  // ▲=期望pass ▼=期望reject
    console.log(`  ${tag} score=${s.toFixed(3)}  [${results}]  ${w.note}`)
  }
  console.log()
  console.log('  ▲=期望 match  ▼=期望 reject   ✅=实际pass  ❌=实际reject')
  console.log('  若 ▲全✅ 且 ▼全❌，该阈值可用。')

  // ── 策略 D：英文原词 vs 中文用户输入（多语言对齐）─────────────────
  type CaseD = { en: string; zh: string; userInput: string; expect: boolean; note: string }
  const CASES_D: CaseD[] = [
    // 真近义词（期望 match=true）
    { en: 'happy',     zh: '快乐', userInput: '高兴',   expect: true,  note: 'happy→高兴（近义）' },
    { en: 'happy',     zh: '快乐', userInput: '开心',   expect: true,  note: 'happy→开心（近义）' },
    { en: 'angry',     zh: '愤怒', userInput: '生气',   expect: true,  note: 'angry→生气（近义）' },
    { en: 'beautiful', zh: '美丽', userInput: '漂亮',   expect: true,  note: 'beautiful→漂亮（近义）' },
    { en: 'beautiful', zh: '美丽', userInput: '好看',   expect: true,  note: 'beautiful→好看（近义）' },
    { en: 'noisy',     zh: '吵闹', userInput: '嘈杂',   expect: true,  note: 'noisy→嘈杂（近义）' },
    { en: 'careful',   zh: '小心', userInput: '仔细',   expect: true,  note: 'careful→仔细（近义）' },
    { en: 'gentle',    zh: '温柔', userInput: '温和',   expect: true,  note: 'gentle→温和（近义）' },
    // 历史误判（期望 match=false）
    { en: 'happy',     zh: '快乐', userInput: '兴奋',   expect: false, note: 'happy vs 兴奋 (FP)' },
    { en: 'happy',     zh: '快乐', userInput: '自豪',   expect: false, note: 'happy vs 自豪 (FP)' },
    { en: 'happy',     zh: '快乐', userInput: '特殊的', expect: false, note: 'happy vs 特殊的 (FP)' },
    { en: 'noisy',     zh: '吵闹', userInput: '浮躁',   expect: false, note: 'noisy vs 浮躁 (临界FP)' },
    { en: 'gentle',    zh: '温柔', userInput: '小气',   expect: false, note: 'gentle vs 小气 (FP)' },
    { en: 'careful',   zh: '小心', userInput: '夸张',   expect: false, note: 'careful vs 夸张 (FP)' },
    { en: 'strange',   zh: '奇怪', userInput: '难过',   expect: false, note: 'strange vs 难过 (FP)' },
    { en: 'important', zh: '重要', userInput: '好处',   expect: false, note: 'important vs 好处 (FP)' },
    { en: 'cute',      zh: '可爱', userInput: '形象',   expect: false, note: 'cute vs 形象 (FP)' },
  ]

  console.log('\n策略D 验证（英文原词作为标准侧 vs 中文用户输入，多语言对齐）\n')
  console.log('  ' + '─'.repeat(68))

  const thresholds_d = [0.55, 0.60, 0.65, 0.70]
  for (const w of CASES_D) {
    const enVec = await embed(model, w.en)
    const uVec  = await embed(model, w.userInput)
    const s     = sim(enVec, uVec)
    const results = thresholds_d.map(t => `t=${t.toFixed(2)}:${s >= t ? '✅' : '❌'}`).join('  ')
    const tag = w.expect ? '▲' : '▼'
    console.log(`  ${tag} score=${s.toFixed(3)}  [${results}]  ${w.note}`)
  }
  console.log()
  console.log('  ▲=期望 match  ▼=期望 reject   ✅=实际pass  ❌=实际reject')
  console.log('  若某阈值下 ▲全✅ 且 ▼全❌，说明策略D在该阈值可用。')
  console.log('═'.repeat(72))
}

main().catch(console.error)
