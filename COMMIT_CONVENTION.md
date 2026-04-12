# Git 提交规范

采用 [Conventional Commits](https://www.conventionalcommits.org/) 规范。

## 格式

```
<type>(<scope>): <subject>

[body]

[footer]
```

## type 类型

| type | 说明 |
|---|---|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档变更（README、注释等） |
| `style` | 代码格式（不影响逻辑，如空格、分号） |
| `refactor` | 重构（不是新功能也不是 Bug 修复） |
| `perf` | 性能优化 |
| `test` | 添加或修改测试 |
| `chore` | 构建工具、依赖、脚本等杂项变更 |
| `revert` | 回滚某次提交 |

## scope 范围（可选）

对应项目模块：

| scope | 说明 |
|---|---|
| `frontend` | 前端整体 |
| `backend` | 后端整体 |
| `db` | 数据库结构 |
| `quiz` | 测验系统 |
| `vocab` | 单词本管理 |
| `speech` | 语音识别 / TTS |
| `ai` | AI 语义识别 |
| `ui` | UI 组件 / 样式 |
| `config` | 配置文件 |

## subject 主题

- 用中文简短描述，不超过 50 个字
- 不以句号结尾
- 使用祈使句，如"添加"、"修复"、"删除"

## 示例

```
feat(quiz): 添加英译中测验阶段基础流程

fix(speech): 修复讯飞 WebSocket 断连后不重试的问题

docs: 更新需求文档补充 MVP 范围说明

chore(config): 添加 .gitignore 和提交规范文档

refactor(db): 将单词表查询抽取为独立 Repository 层
```

> 注意：提交日志统一使用**中文**编写，commit message 不使用英文。

## 分支规范

| 分支 | 说明 |
|---|---|
| `main` | 稳定版本，只接受 merge |
| `dev` | 日常开发主分支 |
| `feat/<name>` | 新功能分支，如 `feat/quiz-system` |
| `fix/<name>` | Bug 修复分支 |

## 提交前检查清单（AI Agent 必须执行）

> 每次执行 `git commit` **之前**，必须按顺序完成以下检查，全部通过后才能提交。
> 任何一项失败，必须先修复，**不允许在检查失败的情况下强行提交**。

### 1. TypeScript 类型检查

在 `backend/` 目录运行：

```bash
cd backend && npx tsc --noEmit
```

**预期**：无任何输出（零错误）。

### 2. 后端测试（含覆盖率）

在 `backend/` 目录运行：

```bash
cd backend && npm run test:coverage
```

**预期**：
- 所有测试通过（0 failed）
- 各项覆盖率指标不低于 `vitest.config.ts` 中 `thresholds` 设定的阈值
- 不允许为通过检查而降低 `thresholds` 阈值

### 3. 前端 TypeScript 类型检查

在 `frontend/` 目录运行：

```bash
cd frontend && npx tsc --noEmit
```

**预期**：无任何输出（零错误）。

### 4. 生成提交信息

按本文件「格式」规范生成提交信息，使用**中文**，遵循 Conventional Commits。
