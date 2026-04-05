# 本地开发指南

本文档适合想要修改源码、参与贡献或二次开发的开发者。

普通用户请直接参考 [README](../README.md#docker-部署) 的 Docker 部署章节。

---

## 环境要求

- Node.js 20+
- npm 10+

---

## 安装依赖

```bash
# 后端
cd backend
npm install

# 前端
cd ../frontend
npm install
```

---

## 配置环境变量

```bash
cp backend/.env.example backend/.env
```

编辑 `backend/.env`：

```env
# 讯飞语音（STT / TTS）
XUNFEI_APP_ID=你的AppID
XUNFEI_API_KEY=你的APIKey
XUNFEI_API_SECRET=你的APISecret

# DeepSeek（AI 例句生成，可选）
DEEPSEEK_API_KEY=你的APIKey

# 数据库路径（默认 backend/data/word-test.db）
# DB_PATH=./data/word-test.db
```

> 讯飞语音非必须，不配置时语音输入和朗读功能不可用，其余功能正常。

---

## 启动开发服务

```bash
# 根目录，同时启动前后端
npm run dev

# 或分别启动
cd backend && npm run dev   # 后端 http://localhost:3000
cd frontend && npm run dev  # 前端 http://localhost:5173
```

前端 dev server 内置代理，`/api/*` 请求自动转发到后端 `:3000`。

---

## 导入词表

在 `单词本` 页面点击 `+` 导入 `.txt` 文件，格式：

```
apple 苹果
banana 香蕉
have a good time 玩得开心
```

每行一条，英文与中文之间用空格分隔。

---

## 测试

```bash
cd backend

# 运行所有测试
npm test

# 监听模式（开发时实时反馈）
npm run test:watch

# 生成覆盖率报告（输出到 backend/coverage/）
npm run test:coverage
```

测试覆盖核心业务逻辑：

- 艾宾浩斯间隔计算
- 今日任务统计（新词 / 复习词 / 剩余配额）
- 计划 Session 完整流程（开始 → 答题 → 完成 → 掌握度写入）
- 中途退出再进入的补偿逻辑
- 首次正确率计算

修复 Bug 时请遵循 [Bug 修复流程](.github/prompts/bugfix.prompt.md)：先写测试复现 Bug，验证测试失败后再修改代码。

---

## 项目结构

```
word-test/
├── backend/                    # Express API 服务
│   ├── src/
│   │   ├── app.ts              # Express 应用（路由 + 中间件）
│   │   ├── index.ts            # 入口（监听端口 + 预热语义模型）
│   │   ├── routes/             # API 路由
│   │   │   ├── tasks.ts        # 今日任务、艾宾浩斯调度
│   │   │   ├── quiz.ts         # 测验 session、答题、finish
│   │   │   ├── pet.ts          # 宠物系统
│   │   │   ├── wordbooks.ts    # 单词本 CRUD + 导入
│   │   │   ├── plans.ts        # 学习计划
│   │   │   ├── students.ts     # 学生管理
│   │   │   ├── tts.ts          # TTS 代理
│   │   │   ├── stt.ts          # STT 代理
│   │   │   └── semantic.ts     # 语义匹配接口
│   │   ├── services/
│   │   │   ├── xunfei/         # 讯飞语音（auth / stt / tts）
│   │   │   ├── semantic.ts     # 本地语义模型推理
│   │   │   └── deepseek.ts     # AI 例句生成
│   │   └── db/
│   │       ├── client.ts       # better-sqlite3 单例
│   │       └── schema.ts       # 建表 + 幂等 ALTER TABLE
│   ├── scripts/                # 工具脚本（生成例句、探测模型等）
│   └── vitest.config.ts        # 测试配置（内存数据库隔离）
├── frontend/                   # React 单页应用
│   └── src/
│       ├── pages/              # 页面组件
│       ├── components/         # 通用组件（MasteryBar / TtsButton / VoiceInput）
│       ├── hooks/              # 数据 hooks
│       └── api/index.ts        # 所有后端接口封装
├── docs/                       # 设计文档（数据库 schema / UX 设计）
├── Dockerfile                  # 三阶段构建
├── docker-compose.yml          # 生产部署配置
└── .github/
    ├── workflows/
    │   └── docker-publish.yml  # 自动构建推送镜像
    └── prompts/
        └── bugfix.prompt.md    # Bug 修复工作流
```

---

## 生产构建（本地验证 Docker 镜像）

```bash
# 在项目根目录构建并启动
docker compose -f docker-compose.yml up --build

# 访问 http://localhost:3000
```
