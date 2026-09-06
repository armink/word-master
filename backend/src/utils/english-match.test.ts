import { describe, it, expect } from 'vitest'
import { matchEnglishAnswer } from './english-match.js'

describe('matchEnglishAnswer - 基础功能', () => {
  it('精确匹配', () => {
    expect(matchEnglishAnswer('give a lesson to somebody', 'give a lesson to somebody')).toBe(true)
  })

  it('大小写不敏感', () => {
    expect(matchEnglishAnswer('Give A Lesson', 'give a lesson')).toBe(true)
  })

  it('斜杠备选：写任意一个变体', () => {
    expect(matchEnglishAnswer('be/get familiar with', 'be familiar with')).toBe(true)
    expect(matchEnglishAnswer('be/get familiar with', 'get familiar with')).toBe(true)
  })

  it('完全不匹配', () => {
    expect(matchEnglishAnswer('give a lesson to somebody', 'take a nap')).toBe(false)
  })
})

describe('matchEnglishAnswer - sb./sth. 缩写识别', () => {
  it('sb. → somebody：词库存缩写，用户输全称', () => {
    expect(matchEnglishAnswer('give a lesson to sb.', 'give a lesson to somebody')).toBe(true)
  })

  it('sb（无点）→ somebody：词库存缩写，用户输全称', () => {
    expect(matchEnglishAnswer('give a lesson to sb', 'give a lesson to somebody')).toBe(true)
  })

  it('somebody → sb.：词库存全称，用户输缩写', () => {
    expect(matchEnglishAnswer('give a lesson to somebody', 'give a lesson to sb.')).toBe(true)
  })

  it('sth. → something：词库存缩写，用户输全称', () => {
    expect(matchEnglishAnswer('do sth.', 'do something')).toBe(true)
  })

  it('sth（无点）→ something：词库存缩写，用户输全称', () => {
    expect(matchEnglishAnswer('do sth', 'do something')).toBe(true)
  })

  it('sb. 与 sth. 同时出现', () => {
    expect(matchEnglishAnswer('give sth. to sb.', 'give something to somebody')).toBe(true)
  })

  it("sb.'s 所有格缩写", () => {
    expect(matchEnglishAnswer("improve sb.'s memory", "improve somebody's memory")).toBe(true)
  })

  it("sth.'s 所有格缩写", () => {
    expect(matchEnglishAnswer("change sth.'s meaning", "change something's meaning")).toBe(true)
  })

  it('虽然包含 sb 字母但不是缩写，不应误展开', () => {
    // "suburbs" 包含 "sb" 但不应被展开
    expect(matchEnglishAnswer('suburbs', 'suburbs')).toBe(true)
    expect(matchEnglishAnswer('suburbs', 'somebody')).toBe(false)
  })
})

describe('matchEnglishAnswer - 语音识别末尾标点容错', () => {
  it('STT 返回末尾英文句号应视为正确', () => {
    expect(matchEnglishAnswer('give a lesson to somebody', 'give a lesson to somebody.')).toBe(true)
  })

  it('STT 返回末尾中文句号应视为正确', () => {
    expect(matchEnglishAnswer('give a lesson to somebody', 'Give a lesson to somebody。')).toBe(true)
  })

  it('STT 返回末尾逗号应视为正确', () => {
    expect(matchEnglishAnswer('on foot', 'on foot,')).toBe(true)
  })

  it('STT + sb. 缩写 + 末尾标点同时存在应视为正确', () => {
    expect(matchEnglishAnswer('give a lesson to sb.', 'give a lesson to somebody.')).toBe(true)
  })
})

describe('matchEnglishAnswer - 短语省略号 ... 占位符容错', () => {
  it('标准答案含 ... 占位符，用户语音不含省略号应匹配：stop ... from ...', () => {
    expect(matchEnglishAnswer('stop ... from ...', 'stop from')).toBe(true)
  })

  it('标准答案含末尾 ... 占位符，用户语音不含省略号应匹配：take in ...', () => {
    expect(matchEnglishAnswer('take in ...', 'take in')).toBe(true)
  })

  it('标准答案含 ... 占位符，用户语音不含省略号应匹配：show no interest in ...', () => {
    expect(matchEnglishAnswer('show no interest in ...', 'show no interest in')).toBe(true)
  })

  it('标准答案含 ... 且同时有 sb./sth. 缩写，用户语音不含省略号应匹配', () => {
    expect(matchEnglishAnswer('give sth. to sb. ...', 'give something to somebody')).toBe(true)
  })

  it('标准答案无 ... 时行为不变：精确匹配仍生效', () => {
    expect(matchEnglishAnswer('give a lesson to somebody', 'give a lesson to somebody')).toBe(true)
  })

  it('标准答案无 ... 时不匹配行为不变', () => {
    expect(matchEnglishAnswer('give a lesson to somebody', 'take a nap')).toBe(false)
  })
})

describe('matchEnglishAnswer - 同音词模糊匹配（STT 误识别容错）', () => {
  it('STT 将 now 误识别为 know 应匹配：now that → know that', () => {
    expect(matchEnglishAnswer('now that', 'know that')).toBe(true)
  })

  it('STT 多词短语中部分误识别应匹配：look forward to → look forward too', () => {
    expect(matchEnglishAnswer('look forward to', 'look forward too')).toBe(true)
  })

  it('完全不同的词不应模糊匹配：cat → hat', () => {
    expect(matchEnglishAnswer('cat', 'hat')).toBe(false)
  })

  it('含义完全不同的短词不应模糊匹配：on → in', () => {
    expect(matchEnglishAnswer('on', 'in')).toBe(false)
  })

  it('精确匹配仍优先生效', () => {
    expect(matchEnglishAnswer('give a lesson', 'give a lesson')).toBe(true)
  })

  it('模糊匹配不影响 sb./sth. 缩写 + ... 组合场景', () => {
    expect(matchEnglishAnswer('give sth. to sb. ...', 'give something to somebody')).toBe(true)
  })
})

describe('matchEnglishAnswer - 同音词语音匹配（STT 同音误识别）', () => {
  it('STT 将 high 识别为 hi（同音，字符差异大）应匹配', () => {
    expect(matchEnglishAnswer('high', 'hi')).toBe(true)
  })

  it('STT 将 grain 识别为 green（同音）应匹配', () => {
    expect(matchEnglishAnswer('grain', 'green')).toBe(true)
  })

  it('STT 将 beef 识别为 biff（同音）应匹配', () => {
    expect(matchEnglishAnswer('beef', 'biff')).toBe(true)
  })

  it('多词短语逐词同音误识别应匹配：high grain → hi green', () => {
    expect(matchEnglishAnswer('high grain', 'hi green')).toBe(true)
  })

  it('同音但词数不同不应匹配：grain → a green', () => {
    expect(matchEnglishAnswer('grain', 'a green')).toBe(false)
  })

  it('2 字母短同音词受长度保护，不误判：on → in', () => {
    expect(matchEnglishAnswer('on', 'in')).toBe(false)
  })

  it('拼写测验关闭语音容错：high → hi 在 phonetic:false 下应判错', () => {
    expect(matchEnglishAnswer('high', 'hi', { phonetic: false })).toBe(false)
  })

  it('语音容错不影响明显不同的词：cat → hat', () => {
    expect(matchEnglishAnswer('cat', 'hat')).toBe(false)
  })
})

describe('matchEnglishAnswer - 逐字母拼读匹配', () => {
  it('用户逐字母拼读应匹配：high → h i g h', () => {
    expect(matchEnglishAnswer('high', 'h i g h')).toBe(true)
  })

  it('逐字母大写拼读应匹配：grain → G R A I N', () => {
    expect(matchEnglishAnswer('grain', 'G R A I N')).toBe(true)
  })

  it('拼写测验同样支持逐字母拼读：beef → b e e f', () => {
    expect(matchEnglishAnswer('beef', 'b e e f', { phonetic: false })).toBe(true)
  })

  it('逐字母拼读漏字母不应匹配：high → h i g', () => {
    expect(matchEnglishAnswer('high', 'h i g')).toBe(false)
  })

  it('多词短语逐字母拼读应匹配：on foot → o n f o o t', () => {
    expect(matchEnglishAnswer('on foot', 'o n f o o t')).toBe(true)
  })
})
