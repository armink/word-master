/**
 * MiniLM vs BGE-small-zh-v1.5 全量对比
 * 使用与 semantic.test.ts 完全相同的测试用例。
 *
 * 运行: npx tsx scripts/compare-models.ts
 *
 * 输出：
 *  - 每条用例的 MiniLM（mean, th=0.76）和 BGE CLS（th=0.63）得分与判定
 *  - 汇总表（TP/TN/FP/FN 及 Precision/Recall/F1）
 *  - 差异列表（MiniLM ≠ BGE 的用例）
 */
import { pipeline, cos_sim, env } from '@xenova/transformers'

env.remoteHost = 'https://hf-mirror.com'

// ─── 完整测试用例（与 semantic.test.ts 同步）───────────────────
interface Case {
  standard: string
  input:    string
  expect:   boolean   // true = 应匹配，false = 应拒绝
  note:     string
  stage?: 'exact' | 'keyword' | 'vector'  // 提示属于哪个阶段
}

// Stage 1/2 用例（精确/关键词，模型无关，仅作参考）
const KEYWORD_CASES: Case[] = [
  { standard: '美丽', input: '美丽',   expect: true,  note: 'beautiful 精确' },
  { standard: '丑陋', input: '丑陋',   expect: true,  note: 'ugly 精确' },
  { standard: '快乐', input: '快乐',   expect: true,  note: 'happy 精确' },
  { standard: '愤怒', input: '愤怒',   expect: true,  note: 'angry 精确' },
  { standard: '勇敢', input: '勇敢',   expect: true,  note: 'brave 精确' },
  { standard: '安静', input: '安静',   expect: true,  note: 'quiet 精确' },
  { standard: '干净', input: '干净',   expect: true,  note: 'clean 精确' },
  { standard: '聪明', input: '聪明',   expect: true,  note: 'clever 精确' },
  { standard: '脏',   input: '脏',     expect: true,  note: 'dirty 单字精确' },
  { standard: '吵闹', input: '吵闹',   expect: true,  note: 'noisy 精确' },
  { standard: '小心', input: '小心',   expect: true,  note: 'careful 精确' },
  { standard: '奇怪', input: '奇怪',   expect: true,  note: 'strange 精确' },
  { standard: '重要', input: '重要',   expect: true,  note: 'important 精确' },
  { standard: '可爱', input: '可爱',   expect: true,  note: 'cute 精确' },
  { standard: '丑陋', input: '丑',     expect: true,  note: 'ugly 口语简短' },
  { standard: '美丽', input: '很美',   expect: true,  note: 'beautiful 副词' },
  // 否定词（关键词阶段拦截）
  { standard: '丑陋', input: '不丑陋', expect: false, note: '否定：不丑陋' },
  { standard: '丑陋', input: '不丑',   expect: false, note: '否定：不丑' },
  { standard: '美丽', input: '不美丽', expect: false, note: '否定：不美丽' },
  { standard: '快乐', input: '不快乐', expect: false, note: '否定：不快乐' },
  { standard: '勇敢', input: '不勇敢', expect: false, note: '否定：不勇敢' },
  { standard: '安静', input: '不安静', expect: false, note: '否定：不安静' },
  { standard: '干净', input: '不干净', expect: false, note: '否定：不干净' },
  { standard: '聪明', input: '不聪明', expect: false, note: '否定：不聪明' },
  { standard: '愤怒', input: '不愤怒', expect: false, note: '否定：不愤怒' },
  { standard: '脏',   input: '不脏',   expect: false, note: '否定：不脏（单字）' },
  { standard: '丑陋', input: '没有丑陋', expect: false, note: '否定：没有丑陋' },
  { standard: '干净', input: '没干净', expect: false, note: '否定：没干净' },
  { standard: '愤怒', input: '非常愤怒', expect: true, note: '副词非否定' },
]

// Stage 3 向量用例（模型相关，是对比重点）
const VECTOR_CASES: Case[] = [
  // ── 真近义词（应匹配）──────────────────────────
  { standard: '美丽', input: '漂亮',   expect: true,  note: 'beautiful → 漂亮' },
  { standard: '美丽', input: '好看',   expect: true,  note: 'beautiful → 好看（弱近义）' },
  { standard: '快乐', input: '高兴',   expect: true,  note: 'happy → 高兴' },
  { standard: '快乐', input: '开心',   expect: true,  note: 'happy → 开心' },
  { standard: '愤怒', input: '生气',   expect: true,  note: 'angry → 生气' },
  { standard: '吵闹', input: '嘈杂',   expect: true,  note: 'noisy → 嘈杂（弱近义）' },
  { standard: '吵闹', input: '喧闹',   expect: true,  note: 'noisy → 喧闹' },
  { standard: '小心', input: '仔细',   expect: true,  note: 'careful → 仔细（弱近义）' },
  { standard: '小心', input: '谨慎',   expect: true,  note: 'careful → 谨慎' },
  { standard: '奇怪', input: '奇特',   expect: true,  note: 'strange → 奇特' },
  { standard: '重要', input: '重大',   expect: true,  note: 'important → 重大' },
  { standard: '可爱', input: '萌',     expect: true,  note: 'cute → 萌（网络用语）' },
  { standard: '可爱', input: '漂亮',   expect: true,  note: 'cute → 漂亮' },
  { standard: '温柔', input: '温和',   expect: true,  note: 'gentle → 温和' },
  { standard: '温柔', input: '体贴',   expect: true,  note: 'gentle → 体贴（弱近义）' },

  // ── 口语弱近义（KNOWN_LIMITS 参考） ───────────
  { standard: '愤怒', input: '发火',   expect: true,  note: '[弱近义] angry → 发火' },
  { standard: '聪明', input: '机灵',   expect: true,  note: '[弱近义] clever → 机灵' },

  // ── 跨义误判，应拒绝 ──────────────────────────
  { standard: '温柔', input: '小气',   expect: false, note: '❌ gentle/stingy 误判' },
  { standard: '快乐', input: '特殊的', expect: false, note: '❌ happy/special 低相关' },
  { standard: '小心', input: '夸张',   expect: false, note: '❌ careful/exaggerated' },
  { standard: '奇怪', input: '难过',   expect: false, note: '❌ strange/sad 跨域' },
  { standard: '重要', input: '好处',   expect: false, note: '❌ important/benefit 跨义' },
  { standard: '可爱', input: '形象',   expect: false, note: '❌ cute/image 低相关' },
  { standard: '安静', input: '吵闹',   expect: false, note: '❌ quiet/noisy 反义' },
  { standard: '勇敢', input: '胆怯',   expect: false, note: '❌ brave/cowardly 反义' },
  { standard: '美丽', input: '开心',   expect: false, note: '❌ beautiful/happy 跨域' },
  { standard: '勇敢', input: '苹果',   expect: false, note: '❌ brave/apple 无关名词' },
  { standard: '美丽', input: '123',    expect: false, note: '❌ beautiful/数字 无关' },
  { standard: '丑陋', input: '美丽',   expect: false, note: '❌ ugly/beautiful 直接反义' },
  { standard: '美丽', input: '丑陋',   expect: false, note: '❌ beautiful/ugly 直接反义' },

  // ── 同语义域误判（KNOWN_LIMITS 参考）─────────
  { standard: '吵闹', input: '浮躁',   expect: false, note: '[域内误判] noisy → 浮躁' },
  { standard: '快乐', input: '兴奋',   expect: false, note: '[域内误判] happy → 兴奋' },
  { standard: '快乐', input: '自豪',   expect: false, note: '[域内误判] happy → 自豪' },
  { standard: '快乐', input: 'happy',  expect: false, note: '[中英混杂] 英文答中文题' },
]

type Pipe = (t: string, o: Record<string, unknown>) => Promise<{ data: Float32Array }>

async function loadModel(name: string): Promise<Pipe | null> {
  try {
    process.stdout.write(`  加载 ${name} ...`)
    const m = await pipeline('feature-extraction', name) as unknown as Pipe
    console.log(' ✓')
    return m
  } catch (e) {
    console.log(` ✗ ${(e as Error).message.slice(0, 80)}`)
    return null
  }
}

async function score(model: Pipe, a: string, b: string, pooling: 'mean' | 'cls'): Promise<number> {
  const [va, vb] = await Promise.all([
    model(a, { pooling, normalize: true }),
    model(b, { pooling, normalize: true }),
  ])
  return cos_sim(Array.from(va.data), Array.from(vb.data)) as unknown as number
}

function verdict(s: number, threshold: number, expect: boolean): string {
  const match = s >= threshold
  if (match === expect) return expect ? 'TP' : 'TN'
  return expect ? 'FN' : 'FP'
}

function emojiVerdict(v: string): string {
  return v === 'TP' || v === 'TN' ? '✅' : (v === 'FP' ? '❌FP' : '⚠️FN')
}

interface ModelStats { TP: number; TN: number; FP: number; FN: number }
function calcF1(s: ModelStats): string {
  const p = s.TP / (s.TP + s.FP || 1)
  const r = s.TP / (s.TP + s.FN || 1)
  const f1 = (2 * p * r) / (p + r || 1)
  return `P=${(p*100).toFixed(1)}% R=${(r*100).toFixed(1)}% F1=${(f1*100).toFixed(1)}%`
}

async function main() {
  console.log('='.repeat(72))
  console.log(' MiniLM @0.76 (mean) vs BGE-small-zh CLS @0.63  ─  全量对比')
  console.log('='.repeat(72))
  console.log('\n▶ 加载模型...')

  const [miniLM, bge] = await Promise.all([
    loadModel('Xenova/paraphrase-multilingual-MiniLM-L12-v2'),
    loadModel('Xenova/bge-small-zh-v1.5'),
  ])

  if (!miniLM || !bge) {
    console.error('模型加载失败，请检查网络或缓存')
    process.exit(1)
  }

  const cases = VECTOR_CASES  // 只对向量阶段做对比（Stage 1/2 两者等效）
  console.log(`\n▶ 对比 ${cases.length} 条 Stage 3 向量用例\n`)
  console.log(
    '  Expect  MiniLM0.76  BGE0.63    std → input'
  )
  console.log('  ' + '-'.repeat(66))

  const mini: ModelStats = { TP: 0, TN: 0, FP: 0, FN: 0 }
  const bgeS: ModelStats = { TP: 0, TN: 0, FP: 0, FN: 0 }
  const diffs: string[] = []

  for (const c of cases) {
    const [sm, sb] = await Promise.all([
      score(miniLM, c.standard, c.input, 'mean'),
      score(bge,    c.standard, c.input, 'cls'),
    ])
    const vm = verdict(sm, 0.76, c.expect)
    const vb = verdict(sb, 0.63, c.expect)

    mini[vm as keyof ModelStats]++
    bgeS[vb as keyof ModelStats]++

    const diff = vm !== vb ? ' ◄ DIFF' : ''
    const expectIcon = c.expect ? '▲pass' : '▼rej '
    console.log(
      `  ${expectIcon}  M:${sm.toFixed(3)} ${emojiVerdict(vm).padEnd(6)}` +
      `  B:${sb.toFixed(3)} ${emojiVerdict(vb).padEnd(6)}` +
      `  ${c.note}${diff}`
    )

    if (diff) diffs.push(`  ${c.note}: MiniLM=${vm} BGE=${vb}`)
  }

  // ── 汇总 ─────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(72))
  console.log(' 汇总统计（仅 Stage 3 向量用例）')
  console.log('='.repeat(72))
  console.log(`\n  MiniLM @0.76 (mean)：TP=${mini.TP} TN=${mini.TN} FP=${mini.FP} FN=${mini.FN}`)
  console.log(`    ${calcF1(mini)}`)
  console.log(`\n  BGE-small CLS @0.63：TP=${bgeS.TP} TN=${bgeS.TN} FP=${bgeS.FP} FN=${bgeS.FN}`)
  console.log(`    ${calcF1(bgeS)}`)

  if (diffs.length > 0) {
    console.log(`\n  两模型结论不同的用例（${diffs.length} 条）：`)
    diffs.forEach(d => console.log(d))
  } else {
    console.log('\n  ✅ 两模型结论完全一致（无差异）')
  }

  // ── 阈值敏感性（BGE 只列关键节点）───────────────────────────
  console.log('\n' + '='.repeat(72))
  console.log(' BGE CLS 关键得分（帮助选取最优阈值）')
  console.log('='.repeat(72))
  const keyPairs: [string, string, string][] = [
    ['美丽', '好看',   '近义词下限'],
    ['吵闹', '嘈杂',   '近义词下限'],
    ['小心', '仔细',   '弱近义词（FN）'],
    ['可爱', '萌',     '弱近义词（FN）'],
    ['温柔', '体贴',   '弱近义词（FN）'],
    ['愤怒', '发火',   '弱近义词（FN）'],
    ['重要', '好处',   '误判上限'],
    ['快乐', '兴奋',   '误判（无法修复）'],
    ['快乐', '自豪',   '误判（BGE 修复）'],
    ['吵闹', '浮躁',   '误判（BGE 修复）'],
    ['勇敢', '胆怯',   '反义词 BGE 误判'],
  ]
  console.log('  得分     std → input         说明')
  console.log('  ' + '-'.repeat(50))
  for (const [std, inp, desc] of keyPairs) {
    const s = await score(bge, std, inp, 'cls')
    const flag = s >= 0.63 ? '>=0.63' : '< 0.63'
    console.log(`  ${s.toFixed(3)}  ${flag}  "${std}"→"${inp}"  ${desc}`)
  }

  console.log('\n完成。')
}

main().catch(console.error)
