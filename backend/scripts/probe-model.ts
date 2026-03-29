/**
 * 测试备选模型是否可用，并对比几个关键用例得分
 * 运行: npx tsx scripts/probe-model.ts
 */
import { pipeline, cos_sim, env } from '@xenova/transformers'

env.remoteHost = 'https://hf-mirror.com'

type Pipeline = (input: string, opts: Record<string, unknown>) => Promise<{ data: Float32Array }>

async function tryModel(name: string): Promise<Pipeline | null> {
  try {
    process.stdout.write(`[加载] ${name} ...`)
    const m = await pipeline('feature-extraction', name) as unknown as Pipeline
    console.log(' OK')
    return m
  } catch (e) {
    console.log(` FAIL: ${(e as Error).message.slice(0, 80)}`)
    return null
  }
}

async function embedWith(model: Pipeline, text: string, pooling: 'mean' | 'cls'): Promise<number[]> {
  const out = await model(text, { pooling, normalize: true })
  return Array.from(out.data)
}

function sim(a: number[], b: number[]): number {
  return cos_sim(a, b) as unknown as number
}

const PROBES: [string, string, boolean][] = [
  // [standard, input, expect]
  ['快乐', '高兴',   true],   // 近义 → pass
  ['快乐', '开心',   true],   // 近义 → pass
  ['愤怒', '生气',   true],   // 近义 → pass
  ['美丽', '漂亮',   true],   // 近义 → pass
  ['美丽', '好看',   true],   // 近义 → pass（当前 0.76 边界）
  ['吵闹', '嘈杂',   true],   // 近义 → pass
  ['温柔', '温和',   true],   // 近义 → pass
  ['小心', '仔细',   true],   // 近义 → pass
  ['快乐', '兴奋',   false],  // 误判 → reject
  ['快乐', '自豪',   false],  // 误判 → reject
  ['吵闹', '浮躁',   false],  // 临界误判 → reject
  ['温柔', '小气',   false],  // 误判 → reject
  ['小心', '夸张',   false],  // 误判 → reject
  ['奇怪', '难过',   false],  // 误判 → reject
  ['重要', '好处',   false],  // 误判 → reject
]

async function runProbe(model: Pipeline, pooling: 'mean' | 'cls', label: string) {
  console.log(`\n  [${label}]`)
  console.log('  score  expect  std vs input')
  console.log('  ' + '-'.repeat(48))
  for (const [std, inp, exp] of PROBES) {
    const s = sim(
      await embedWith(model, std, pooling),
      await embedWith(model, inp, pooling)
    )
    const icon = exp ? '▲' : '▼'
    const ok = exp ? (s >= 0.62 ? '✅' : '⚠️') : (s < 0.62 ? '✅' : '❌')
    console.log(`  ${s.toFixed(3)}  ${icon} ${ok}  "${std}" vs "${inp}"`)
  }
  console.log('  ▲=期望pass  ▼=期望reject  (参考线 0.62)')
}

async function main() {
  console.log('当前模型 MiniLM（对照，阈值 0.76）')
  const miniLM = await tryModel('Xenova/paraphrase-multilingual-MiniLM-L12-v2')
  if (miniLM) await runProbe(miniLM, 'mean', 'MiniLM mean')

  console.log('\n\n候选模型 BGE-small-zh-v1.5')
  const bge = await tryModel('Xenova/bge-small-zh-v1.5')
  if (bge) {
    await runProbe(bge, 'mean', 'BGE mean pooling')
    await runProbe(bge, 'cls',  'BGE cls pooling（官方推荐）')
  }
}

main().catch(console.error)
