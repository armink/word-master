/**
 * 测试数据种子脚本
 * 运行: npx tsx seed.ts [--reset]
 *   --reset  删除同名单词本后重新插入
 *
 * 重点：以有丰富中文近义词的形容词为主，充分测试语义匹配
 *   例如 beautiful → 学生说"漂亮"/"好看"/"靓"都应该判对
 */
import Database from 'better-sqlite3'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'data', 'word-test.db')
const db = new Database(DB_PATH)
db.pragma('foreign_keys = ON')

// ── 单词数据 ────────────────────────────────────────────────────
// chinese 字段填"标准答案"，有近义词时选最自然的说法
// 语义匹配会对 美丽/漂亮/好看/靓丽 等同义词都判对
const WORDS = [
  // ── 外貌/感官类形容词（近义词最丰富，最适合语义匹配测试）──
  { type: 'word', english: 'beautiful',  chinese: '美丽',   phonetic: '/bjuːt.ɪf.əl/',  example_en: 'What a beautiful garden!',        example_zh: '多美丽的花园！' },
  // → 说"漂亮""好看""靓"都应判对
  { type: 'word', english: 'ugly',       chinese: '丑陋',   phonetic: '/ˈʌɡ.li/',       example_en: 'The old house looks ugly.',       example_zh: '那栋老房子看起来很丑陋。' },
  { type: 'word', english: 'cute',       chinese: '可爱',   phonetic: '/kjuːt/',         example_en: 'The puppy is so cute.',           example_zh: '这只小狗好可爱。' },
  // → 说"萌""甜美"也可接受
  { type: 'word', english: 'clean',      chinese: '干净',   phonetic: '/kliːn/',         example_en: 'Keep your room clean.',           example_zh: '保持房间干净。' },
  { type: 'word', english: 'dirty',      chinese: '脏',     phonetic: '/ˈdɜː.ti/',       example_en: 'Don\'t touch the dirty wall.',    example_zh: '别碰那面脏墙。' },

  // ── 情绪/心理类形容词（近义词极丰富）──
  { type: 'word', english: 'happy',      chinese: '快乐',   phonetic: '/ˈhæp.i/',        example_en: 'I feel happy today.',             example_zh: '我今天感到快乐。' },
  // → 说"高兴""开心""幸福"都判对
  { type: 'word', english: 'sad',        chinese: '悲伤',   phonetic: '/sæd/',           example_en: 'She felt sad after the news.',    example_zh: '听到消息后她感到悲伤。' },
  // → 说"难过""伤心""不开心"都判对
  { type: 'word', english: 'angry',      chinese: '愤怒',   phonetic: '/ˈæŋ.ɡri/',       example_en: 'He was angry at the mistake.',    example_zh: '他对这个错误感到愤怒。' },
  // → 说"生气""发火""恼怒"都判对
  { type: 'word', english: 'scared',     chinese: '害怕',   phonetic: '/skerd/',         example_en: 'I am scared of the dark.',        example_zh: '我害怕黑暗。' },
  // → 说"恐惧""胆怯""恐慌"都判对
  { type: 'word', english: 'nervous',    chinese: '紧张',   phonetic: '/ˈnɜː.vəs/',      example_en: 'I feel nervous before exams.',    example_zh: '考试前我感到紧张。' },
  // → 说"焦虑""不安"都判对
  { type: 'word', english: 'excited',    chinese: '兴奋',   phonetic: '/ɪkˈsaɪ.tɪd/',   example_en: 'The kids are excited.',           example_zh: '孩子们很兴奋。' },
  { type: 'word', english: 'shy',        chinese: '害羞',   phonetic: '/ʃaɪ/',           example_en: 'She is shy in class.',            example_zh: '她在课堂上很害羞。' },
  // → 说"腼腆""内向"语义也接近
  { type: 'word', english: 'proud',      chinese: '自豪',   phonetic: '/praʊd/',         example_en: 'I am proud of you.',              example_zh: '我为你感到自豪。' },
  // → 说"骄傲"也判对（骄傲有两义，但语境明确）
  { type: 'word', english: 'lonely',     chinese: '孤独',   phonetic: '/ˈloʊn.li/',      example_en: 'He felt lonely at night.',        example_zh: '他晚上感到孤独。' },
  // → 说"寂寞"也判对
  { type: 'word', english: 'tired',      chinese: '疲惫',   phonetic: '/taɪərd/',        example_en: 'I am tired after the run.',       example_zh: '跑步后我感到疲惫。' },
  // → 说"累""疲倦"都判对

  // ── 性格/品质类形容词 ──
  { type: 'word', english: 'brave',      chinese: '勇敢',   phonetic: '/breɪv/',         example_en: 'Be brave and try again.',         example_zh: '勇敢地再试一次。' },
  // → 说"大胆""无畏"语义接近
  { type: 'word', english: 'clever',     chinese: '聪明',   phonetic: '/ˈklev.ər/',      example_en: 'She is a clever student.',        example_zh: '她是个聪明的学生。' },
  // → 说"机灵""灵活""智慧"都判对
  { type: 'word', english: 'lazy',       chinese: '懒惰',   phonetic: '/ˈleɪ.zi/',       example_en: 'Don\'t be lazy about studying.',  example_zh: '学习上不要懒惰。' },
  // → 说"懒""偷懒"都判对
  { type: 'word', english: 'polite',     chinese: '礼貌',   phonetic: '/pəˈlaɪt/',       example_en: 'Always be polite to others.',     example_zh: '对别人要一直有礼貌。' },
  { type: 'word', english: 'gentle',     chinese: '温柔',   phonetic: '/ˈdʒen.t̬əl/',    example_en: 'Be gentle with the baby.',        example_zh: '对婴儿要温柔。' },
  // → 说"温和""体贴"语义接近
  { type: 'word', english: 'generous',   chinese: '慷慨',   phonetic: '/ˈdʒen.ər.əs/',   example_en: 'He is generous with gifts.',      example_zh: '他送礼物很慷慨。' },
  // → 说"大方""无私"都判对
  { type: 'word', english: 'patient',    chinese: '耐心',   phonetic: '/ˈpeɪ.ʃənt/',     example_en: 'A good teacher is patient.',      example_zh: '好老师很有耐心。' },
  { type: 'word', english: 'curious',    chinese: '好奇',   phonetic: '/ˈkjʊr.i.əs/',    example_en: 'Children are naturally curious.', example_zh: '孩子天生好奇。' },

  // ── 状态/程度类形容词 ──
  { type: 'word', english: 'quiet',      chinese: '安静',   phonetic: '/ˈkwaɪ.ət/',      example_en: 'Please keep quiet in class.',     example_zh: '上课请保持安静。' },
  // → 说"宁静""平静""沉默"都很近
  { type: 'word', english: 'noisy',      chinese: '吵闹',   phonetic: '/ˈnɔɪ.zi/',       example_en: 'The street is very noisy.',       example_zh: '这条街非常吵闹。' },
  { type: 'word', english: 'careful',    chinese: '小心',   phonetic: '/ˈker.fəl/',      example_en: 'Be careful on the stairs.',       example_zh: '上楼梯要小心。' },
  // → 说"仔细""谨慎""注意"都判对
  { type: 'word', english: 'strange',    chinese: '奇怪',   phonetic: '/streɪndʒ/',      example_en: 'That\'s a strange sound.',        example_zh: '那是个奇怪的声音。' },
  // → 说"怪异""离奇"也接近
  { type: 'word', english: 'important',  chinese: '重要',   phonetic: '/ɪmˈpɔːr.t̬ənt/', example_en: 'Health is very important.',       example_zh: '健康非常重要。' },
  { type: 'word', english: 'difficult',  chinese: '困难',   phonetic: '/ˈdɪf.ɪ.kəlt/',   example_en: 'The puzzle is difficult.',        example_zh: '这道题很困难。' },
  // → 说"难""不容易"也判对

  // ── 抽象名词（一对多中文说法）──
  { type: 'word', english: 'courage',    chinese: '勇气',   phonetic: '/ˈkɜː.rɪdʒ/',     example_en: 'It takes courage to try.',        example_zh: '尝试需要勇气。' },
  { type: 'word', english: 'wisdom',     chinese: '智慧',   phonetic: '/ˈwɪz.dəm/',      example_en: 'Grandma has great wisdom.',       example_zh: '奶奶有很大的智慧。' },
  { type: 'word', english: 'friendship', chinese: '友谊',   phonetic: '/ˈfrend.ʃɪp/',    example_en: 'Our friendship is strong.',       example_zh: '我们的友谊很牢固。' },
  // → 说"友情""情谊"也判对
  { type: 'word', english: 'imagination', chinese: '想象力', phonetic: '/ɪˌmædʒ.ɪˈneɪ.ʃən/', example_en: 'Use your imagination.',    example_zh: '发挥你的想象力。' },
  { type: 'word', english: 'adventure',  chinese: '冒险',   phonetic: '/ədˈven.tʃər/',   example_en: 'Every day is an adventure.',       example_zh: '每天都是一场冒险。' },

  // ── 词组（以富有情感/动作的短语为主）──
  { type: 'phrase', english: 'be careful',       chinese: '小心',     phonetic: null, example_en: 'Be careful crossing the road.',    example_zh: '过马路要小心。' },
  { type: 'phrase', english: 'feel nervous',      chinese: '感到紧张', phonetic: null, example_en: 'I feel nervous before speaking.',  example_zh: '发言前我感到紧张。' },
  { type: 'phrase', english: 'make friends',      chinese: '交朋友',   phonetic: null, example_en: 'It\'s easy to make friends here.', example_zh: '在这里交朋友很容易。' },
  { type: 'phrase', english: 'give up',           chinese: '放弃',     phonetic: null, example_en: 'Never give up trying.',            example_zh: '永远不要放弃尝试。' },
  { type: 'phrase', english: 'work hard',         chinese: '努力',     phonetic: null, example_en: 'Work hard and you\'ll succeed.',   example_zh: '努力，你就会成功。' },
  // → 说"努力工作""拼命""认真"都判对
  { type: 'phrase', english: 'take a deep breath', chinese: '深呼吸',  phonetic: null, example_en: 'Take a deep breath to calm down.', example_zh: '深呼吸让自己平静下来。' },
  { type: 'phrase', english: 'feel proud',        chinese: '感到自豪', phonetic: null, example_en: 'I feel proud of what I did.',      example_zh: '我为自己做的事感到自豪。' },
  { type: 'phrase', english: 'lose patience',     chinese: '失去耐心', phonetic: null, example_en: 'Don\'t lose patience so easily.',  example_zh: '不要那么容易失去耐心。' },
  { type: 'phrase', english: 'look forward to',   chinese: '期待',     phonetic: null, example_en: 'I look forward to the holiday.',   example_zh: '我很期待这个假期。' },
  { type: 'phrase', english: 'stay calm',         chinese: '保持冷静', phonetic: null, example_en: 'Stay calm in an emergency.',       example_zh: '遇到紧急情况要保持冷静。' },
  // → 说"冷静""沉着"也判对
]

const WORDBOOK_NAME = '语义匹配测试（形容词为主）'
const WORDBOOK_DESC = '以有丰富中文近义词的形容词为主。说"漂亮/好看/靓"都应该和 beautiful 匹配，用于验证三阶段语义匹配效果。'

// ── 写入数据库 ──────────────────────────────────────────────────
const reset = process.argv.includes('--reset')

const insertAll = db.transaction(() => {
  const existing = db.prepare('SELECT id FROM wordbooks WHERE name = ?').get(WORDBOOK_NAME) as { id: number } | undefined
  if (existing) {
    if (!reset) {
      console.log(`单词本已存在 (id=${existing.id})，跳过。使用 --reset 重新生成。`)
      return
    }
    db.prepare('DELETE FROM wordbooks WHERE id = ?').run(existing.id)
    console.log(`已删除旧单词本 (id=${existing.id})，重新生成…`)
  }

  // 创建单词本
  const wb = db.prepare('INSERT INTO wordbooks (name, description) VALUES (?, ?)').run(WORDBOOK_NAME, WORDBOOK_DESC)
  const wbId = wb.lastInsertRowid

  let count = 0
  for (const w of WORDS) {
    const item = db.prepare(`
      INSERT INTO items (type, english, chinese, phonetic, example_en, example_zh)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(w.type, w.english, w.chinese, w.phonetic ?? null, w.example_en ?? null, w.example_zh ?? null)

    db.prepare('INSERT INTO wordbook_items (wordbook_id, item_id, sort_order) VALUES (?, ?, ?)').run(wbId, item.lastInsertRowid, count)
    count++
  }

  console.log(`✅ 已创建单词本 "${WORDBOOK_NAME}" (id=${wbId})，共插入 ${count} 条`)
  console.log()
  console.log('近义词测试建议（英→中）：')
  console.log('  beautiful → 说"漂亮"/"好看"/"靓" 应判对')
  console.log('  angry     → 说"生气"/"发火"/"恼怒" 应判对')
  console.log('  tired     → 说"累"/"疲倦" 应判对')
  console.log('  clever    → 说"聪明"/"机灵"/"灵活" 应判对')
  console.log('  lonely    → 说"寂寞" 应判对')
})

insertAll()
db.close()
