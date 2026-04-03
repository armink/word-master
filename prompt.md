## 背景

我家小朋友正在学习英语，但单词和词组总是记不住。应该是学习方法的问题，他比较懒，不太喜欢手写边读出声音来边背诵。然后我就买了一个百词斩硬件给他背，发现效果也很差，虽然都打卡完了，但是百词斩学习机是的打卡测试是提供选项进行背诵，真正测验哪有那么多选项，是要求他既能英译中 ，也能中译英，每个单词的拼写还都得正确。

于是，我在想能否开发一个软件，优先完成闭环测验，英能译中，再中能译英，最后是单词拼写。每个单词的测验都要达到一定的正确率才能算完成。这样就能真正的背诵了。测验好用以后，我还想增加背诵记忆的功能，有一定记忆方法和乐趣，让小朋友更喜欢背诵。最终背诵和测验结合起来，形成一个完整的闭环学习系统。

## 目标

- 开发一个英语单词背诵和测验的软件，帮助小朋友更有效地记忆单词。


## 功能需求

- 测验系统：包含英译中、中译英和单词拼写三个阶段，每个阶段都要达到一定的正确率才能算完成。
- 记忆系统：提供一定的记忆方法和乐趣，让小朋友更喜欢背诵。基于艾宾浩斯遗忘曲线，自动安排待复习单词的推送顺序。
- 单词本导入：（一般是老师下发的），并指定学习任务，完成后可以生成学习报告，帮助家长和老师了解学习进度和效果。

- 数据分析：数据统计和分析功能，帮助用户了解自己的学习情况，发现薄弱环节，制定更有效的学习计划。
- 激励机制：每日学习提醒和连续打卡激励

### 软件能力要求

- 语音交互：输入单词和中文支持语音输入，而且不是单纯选项选择，避免陷入百词斩式的死循环，真正达到背诵的效果，也让孩子多动嘴。
- AI 语义识别：语音输入的中文支持按照语义识别正确度来判断是否正确，而不是单纯的文字匹配。
- 英文输入：中译英可以按照单词发音进行输入而非拼写，测试拼写阶段按照键盘输入
- 语音朗读：单词/例句支持 TTS 播放，学习和测验时均可触发发音
- 单词本格式：按照软件要求进行导入，如：txt，内部按照 hello:你好;world:世界 的格式进行存储和解析，具体看后续设计。最好能支持 OCR 后，再用 AI 进行语义识别，自动生成单词本，减少人工输入的麻烦，可以放后期做。
- 运行平台：web H5，支持移动端访问

### MVP 范围

- 测验系统：实现英译中、中译英和单词拼写三个阶段的测验功能，达到一定正确率后才能算完成。
- 记忆系统：暂不支持（艾宾浩斯遗忘曲线复习计划放第二阶段）
- 单词表导入：不需要开发，从 PDF 里面直接提取 second week 的单词表，按照软件要求的格式进行存储和解析。
- 数据分析：暂不支持
- 激励机制：暂不支持
- 语音交互：实现语音输入和语义识别功能，支持英译中和中译英的测验阶段。
- 语音朗读：实现单词和例句的 TTS 播放
- 英文输入：中译英阶段支持单词发音输入，测试拼写阶段支持键盘输入
- 运行平台：web H5，支持移动端访问
- UI 设计：简洁易用，适合小朋友使用，后续可以根据用户反馈进行优化。

## 软件设计

### 技术方案要求

- 前端：React + TypeScript + Vite
- 后端：Node.js + Express + TypeScript
- 数据库：SQLite（better-sqlite3）

- 第三方服务要求：
  - 抽象出服务接口层，可以适配不同的服务商
  - 优先适配讯飞语音识别和 TTS 服务，后续可以根据需要适配其他服务商
  - AI 语义识别也用讯飞的语义理解服务，后续可以根据需要适配其他服务商

### 测验规则

- 每天定义学习目标阶段，如单词本中的50个单词，阶段正确率 ≥ 80% 算过关
- 答错后重入队列，直到达标

### UX 交互设计规范

- 整体风格：卡片式，扁平，适合儿童，参考 Duolingo 风格，主色调绿色
- 主要页面：首页、单词本管理、今日任务、测验、学习记录
- 测验流程：每次显示一个单词，语音播放后开始答题，答完即时反馈对错，
            答错重入队列，全部过关后显示结果页
- 项目结构：monorepo，frontend/ 和 backend/ 在同一仓库

### 开发规范

- 样式方案：Tailwind CSS
- 环境变量：使用 .env 文件管理讯飞 AppID/APIKey，代码中不硬编码
- API 风格：RESTful，前后端通过 HTTP JSON 通信

## 当前实现状态（已完成）

### 技术栈
- 前端：React 19 + TypeScript + Vite + Tailwind CSS，端口 5173
- 后端：Node.js + Express + TypeScript + better-sqlite3，端口 3000
- 数据库：SQLite，`backend/data/word-test.db`
- monorepo 结构：`frontend/` + `backend/`

### 项目目录结构
```
frontend/src/
  api/index.ts              # 所有后端接口封装
  components/
    MasteryBar.tsx          # 掌握度进度条组件
    TtsButton.tsx           # TTS 朗读按钮
    VoiceInput.tsx          # 微信风格语音输入（全屏遮罩+左滑取消）
  hooks/
    useAudioRecorder.ts     # 录音 hook
    useStudent.ts           # 学生 context
    useWordbook.ts          # 单词本 hook
  layouts/AppLayout.tsx     # 底部 tab 导航布局
  pages/
    HomePage.tsx            # 首页（选择学生）
    WordbooksPage.tsx       # 单词本列表（长按删除）
    WordbookDetailPage.tsx  # 单词本详情+导入+制定计划
    TasksPage.tsx           # 今日任务（复习/新词/整体进度）
    QuizPage.tsx            # 测验答题主界面
    QuizResultPage.tsx      # 测验结果页
    RecordsPage.tsx         # 学习记录（按掌握度筛选）
  types/index.ts
  utils/sound.ts            # 答题音效
  App.tsx                   # 路由 + 全局 contextmenu 拦截
  main.tsx
  index.css                 # Tailwind base + 语音波形动画

backend/src/
  db/
    client.ts               # better-sqlite3 单例
    schema.ts               # 建表 + 幂等 ALTER TABLE
  routes/
    students.ts             # CRUD 学生
    wordbooks.ts            # 单词本 CRUD + 导入(去重) + 导出
    plans.ts                # 学习计划 CRUD
    tasks.ts                # 今日任务 + 艾宾浩斯调度
    quiz.ts                 # 测验 session + 答题 + finishSession
    records.ts              # 学习记录查询
    stt.ts                  # 语音识别代理（讯飞）
    tts.ts                  # TTS 代理（讯飞）
    semantic.ts             # 语义匹配接口
  services/
    xunfei/auth.ts          # 讯飞鉴权
    xunfei/stt.ts           # 讯飞 STT
    xunfei/tts.ts           # 讯飞 TTS
    semantic.ts             # 三阶段语义匹配（精确/关键词/MiniLM向量）
    deepseek.ts             # DeepSeek V3 例句生成
  types/index.ts
  index.ts                  # Express 入口
```

### 数据库表结构（当前实际）

| 表名 | 用途 |
|------|------|
| `students` | 学生（id, name） |
| `wordbooks` | 单词本（id, name, description） |
| `items` | 词条（type: word/phrase, english, chinese, phonetic, example_en, example_zh, example_status） |
| `wordbook_items` | 单词本与词条的多对多，含 sort_order |
| `student_mastery` | 每个学生对每个词条的掌握状态（三阶段 stage/next + introduced_date） |
| `study_plans` | 学习计划（student_id, wordbook_id, daily_new, status） |
| `quiz_sessions` | 测验会话（student_id, wordbook_id, quiz_type, status, total_words） |
| `session_items` | session 内每个词条的测验类型和顺序 |
| `quiz_answers` | 每次答题记录（item_id, is_correct, user_answer, duration_ms） |

### 艾宾浩斯三阶段复习机制

每个词条针对三种测验类型独立跟踪进度：
- `en_to_zh`（英译中）：引入词条时解锁，stage 1→2→…→5
- `zh_to_en`（中译英）：en_to_zh_stage ≥ 2 后解锁
- `spelling`（拼写，仅单词）：zh_to_en_stage ≥ 2 后解锁

复习间隔（艾宾浩斯）：stage1→2: +1天, 2→3: +3天, 3→4: +7天, 4→5: +14天, 5: +30天

每日任务调度（`buildTodayItems`）：
1. 查询所有 `introduced_date > 0` 且 `*_next <= today` 的到期复习词
2. 查询今日尚未引入的新词，数量 = `daily_new - todayIntroduced`
3. 剔除进行中 session 已答对的词
4. 新词答错不写 `introduced_date`（保持未引入状态）

### 测验流程（QuizPage）

1. 通过 `GET /api/quiz/sessions/:id` 加载 session + 待答队列
2. 每张卡片显示当前 quizType 的提示词
3. 支持语音输入（按住录音，松手发送/上滑取消）+ 文字输入
4. 答题判定：
   - 英译中：三阶段语义匹配（精确→关键词→MiniLM余弦相似度）
   - 中译英/拼写：`matchEnglishAnswer()`（支持斜杠备选 `be/get familiar with`）
5. 答对 → 进入 correct 状态 → 自动跳下一题
6. 答错 → 进入 wrong 状态（显示正确答案）→ wrongCountdown 倒计时后可继续
7. 全部完成 → `POST /api/quiz/sessions/:id/finish` → 跳转结果页
8. 顶栏：进度条 + 已答/总数；第二行：题型标签 + 首次正确率

### 语音输入（VoiceInput 组件）

- 微信风格：长按按钮 → 全屏遮罩 + 绿色波形动画
- 左下区域（x < 38%, y > 62%）= 取消区，松手滑入该区域取消
- `navigator.vibrate(40)` 开始录音时震动反馈
- 全局 `pointerup` 监听（PC 兼容）代替 `onPointerLeave`
- `passive: false` touchstart 阻断长按系统菜单（仅语音按钮）

### 语义匹配服务

三阶段混合匹配（`checkSemanticMatch`）：
1. 精确匹配（去标点/空格）
2. 关键词包含（2-4字bigram匹配 + 否定词检测）
3. MiniLM 向量余弦相似度（`paraphrase-multilingual-MiniLM-L12-v2`，阈值 0.72）

模型加载失败时自动降级到阶段1-2。

### 已解决的关键 Bug

- 新词答错不写 `introduced_date`（每日配额不被占用）
- 每日配额正确扣减：`LIMIT daily_new - todayIntroduced`
- 退出保存：点「退出并保存」调用 `finishSession` 再导航
- Ghost click 防穿透：`setWrongCountdown(4)` 与 `setCardState('wrong')` 同批次执行
- 斜杠备选答案兼容（`be/get familiar with`）
- 首次正确率分母 = 已答题数（而非总题数）
- 导入词条去重：批次内 Set 去重 + 库内 `lower(english)` 查询
- 长按粘贴菜单：`App.tsx` 中 contextmenu 拦截豁免 input/textarea

### 全局交互规范

- `contextmenu` 全局拦截（防「标记为广告」），豁免 `input`/`textarea`/`contentEditable`
- `button, a, [role="button"]`：CSS 禁用 user-select + touch-callout
- 部分按钮使用原生 `{ passive: false }` touchstart 阻断长按系统菜单
- `maximum-scale=1.0, user-scalable=no`（viewport 防缩放）

---

## 待开发功能

### 激励系统 - 宠物养成（设计中）

#### 核心理念
每天完成任务 → 喂食宠物 → 宠物成长。不打卡宠物会饿（不会死，降低焦虑感）。词汇量越多，宠物能进化到更高形态。

#### 宠物成长阶段

| 阶段 | 名称 | 解锁条件（累计引入词数） | 形象 |
|------|------|------------------------|------|
| 0 | 神秘蛋 | 初始状态 | 🥚 |
| 1 | 幼崽 | 引入 ≥ 10 词 | 🐣 |
| 2 | 少年 | 引入 ≥ 30 词 | 🐥 |
| 3 | 成年 | 引入 ≥ 60 词 | 🐦 |
| 4 | 进化体 | 引入 ≥ 100 词 | 🦅 |
| 5 | 传说 | 引入 ≥ 200 词 | 🦋 |

#### 饥饿度系统

- 每天完成今日任务（review_count + new_count 全部完成）→ 饥饿度重置为满（100）
- 每过一天未完成任务 → 饥饿度 -20（最低 0，不死亡）
- 饥饱状态影响宠物表情：100=开心 / 60-99=正常 / 20-59=有点饿 / 0-19=非常饿
- 心理策略：不是惩罚（不会死），而是"它在等你"的情感绑定

#### 今日任务奖励

| 完成情况 | 奖励 |
|----------|------|
| 完成今日任务 | 饥饿度 +40（上限100）|
| 首次正确率 ≥ 90% | 额外 +10（"今日答题优秀"）|
| 连续打卡 N 天 | 第 7/14/30 天给宠物一个特效/称号 |

#### 数据库设计（新增）

```sql
CREATE TABLE IF NOT EXISTS pet_status (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id    INTEGER NOT NULL UNIQUE REFERENCES students(id),
  stage         INTEGER NOT NULL DEFAULT 0,   -- 0-5 成长阶段
  hunger        INTEGER NOT NULL DEFAULT 80,  -- 0-100 饥饱度
  streak_days   INTEGER NOT NULL DEFAULT 0,   -- 连续打卡天数
  last_fed_date INTEGER NOT NULL DEFAULT 0,   -- YYYYMMDD 最后喂食日期
  total_fed     INTEGER NOT NULL DEFAULT 0,   -- 累计喂食次数（历史打卡总天数）
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
```

#### 后端 API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/pet/:studentId` | 获取宠物状态（含 hunger 每日衰减计算） |
| POST | `/api/pet/:studentId/feed` | 完成今日任务后喂食（由 finishSession 触发或手动调用） |

`GET /api/pet/:studentId` 响应：
```json
{
  "stage": 2,
  "hunger": 75,
  "streak_days": 5,
  "total_fed": 23,
  "mood": "happy",          // happy / normal / hungry / starving
  "can_evolve": false,       // 是否满足下一阶段条件（由引入词数判断）
  "next_stage_words": 60     // 进化到下一阶段需要的词数（当前阶段未达到时）
}
```

#### 喂食触发时机

- `POST /api/tasks/start` 里的 `finishSession` 执行后，如果今日任务全部完成则自动调用喂食
- 喂食接口幂等：同一天重复调用只记录一次（`last_fed_date = today` 去重）

#### 前端页面设计

**首页 / 今日任务页** 展示宠物：
- 宠物形象（emoji 或简单 SVG/Lottie 动画）居中展示
- 饥饱度进度条（带颜色：绿/黄/红）
- 连续打卡天数「🔥 连续 5 天」
- 任务完成后播放喂食动画（宠物表情变开心 + 短暂放大弹跳）

**宠物状态小卡片**（嵌入 TasksPage 任务统计区域下方）：
```
┌─────────────────────────────────┐
│  🐥  少年·阶段2                  │
│  饱食度 ████████░░  75%          │
│  🔥 连续打卡 5 天                 │
│  完成今日任务即可喂食             │
└─────────────────────────────────┘
```

#### 进化动画
- 词数达到下一阶段阈值时，在任务完成结果页展示「进化」动画
- 简单实现：宠物 emoji 放大 → 旋转 → 变为新阶段 emoji，配合 CSS keyframe 动画

#### 连续打卡保护符
- 每 30 天打卡满 20 天，奖励一个「保护符」（最多存 2 个）
- 使用保护符：某天未完成任务但想保住 streak，可消耗一个
- 数据字段：`pet_status.shield_count INTEGER NOT NULL DEFAULT 0`

### 其他规划
- OCR + AI 自动生成单词本
- 数据分析增强（薄弱词分析、周报）
- 多班级/多单词本进度对比

---

## 开发规范

- 样式方案：Tailwind CSS
- 环境变量：`.env` 管理讯飞 AppID/APIKey + DeepSeek API Key
- API 风格：RESTful，前后端 HTTP JSON 通信
- 第三方服务抽象层：`backend/src/services/`，可适配不同服务商