/**
 * DeepSeek V3 例句生成服务
 * 生成符合方案C（情境记忆锚点）风格的例句：
 *  - 第一人称 / 初中生日常场景
 *  - 句子本身词汇不超过初中水平
 *  - 目标词加 [...] 标记
 *  - 英文不超过 12 词，中文不超过 15 字
 */

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions'

const SYSTEM_PROMPT = `你是一个初中英语教学助手，负责为英语词汇/短语生成记忆例句。

例句风格要求（非常重要）：
1. 场景：必须是初中生日常生活场景，例如：写作业、打游戏、找东西、吃饭、看手机、和父母/朋友、考试、放假等
2. 人称：优先使用第一人称 "I / 我"，让学生产生代入感
3. 难度：句子本身的词汇不超过初中水平，绝对不能引入比目标词更难的生词
4. 高亮标记：在英文例句中，用方括号 [目标词] 包裹目标词或其变体形式
5. 长度：英文不超过 12 个单词，中文不超过 15 个字
6. 语气：自然口语化，不要教科书腔

好的例句风格（参考）：
- look for -> "I'm always [looking for] my phone before school." / "我上学前总是在[找]我的手机。"
- give up -> "Don't [give up] the game, you're so close!" / "别[放弃]这局游戏，你快赢了！"
- look forward to -> "I really [look forward to] the summer holiday." / "我超级期待放暑假。"

请严格按照 JSON 格式输出，不要有多余文字。`

interface ExampleResult {
  example_en: string
  example_zh: string
}

/**
 * 为单个词汇调用 DeepSeek V3 生成方案C风格例句
 * @throws 网络错误或 API 返回非 200 时抛出
 */
export async function generateExample(english: string, chinese: string): Promise<ExampleResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY 未配置')

  const userPrompt = `词汇：${english}\n词义：${chinese}\n\n请生成一对例句，输出 JSON：\n{"example_en": "...", "example_zh": "..."}`

  const resp = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 200,
      response_format: { type: 'json_object' },
    }),
  })

  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`DeepSeek API error ${resp.status}: ${body}`)
  }

  const data = await resp.json() as {
    choices: { message: { content: string } }[]
  }

  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('DeepSeek 返回内容为空')

  const parsed = JSON.parse(content) as Partial<ExampleResult>
  if (!parsed.example_en || !parsed.example_zh) {
    throw new Error(`DeepSeek 返回格式不正确: ${content}`)
  }

  return {
    example_en: parsed.example_en.trim(),
    example_zh: parsed.example_zh.trim(),
  }
}
