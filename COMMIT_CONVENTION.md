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
