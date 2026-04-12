# GitHub Copilot 工作区指令

## Git 操作限制

**严禁在未经用户明确授权的情况下执行任何 git 操作**，包括但不限于：
`git commit`、`git push`、`git reset`、`git rebase`、`git merge`、删除分支等。

完成代码修改和提交前检查后，**只告知用户检查结果和建议的提交信息，由用户自行决定是否执行提交和推送**。

## 提交前强制检查

**每次执行 `git commit` 之前**，必须按 [COMMIT_CONVENTION.md](../COMMIT_CONVENTION.md) 中"提交前检查清单"的顺序完成所有检查：

1. `cd backend && npx tsc --noEmit` → 零错误
2. `cd backend && npm run test:coverage` → 全部通过，覆盖率不下降
3. `cd frontend && npx tsc --noEmit` → 零错误

全部通过后再生成提交信息并提交。任何一项失败必须先修复。

## 提交信息规范

遵循 [COMMIT_CONVENTION.md](../COMMIT_CONVENTION.md)：
- 格式：`<type>(<scope>): <subject>`
- 语言：**中文**
- 不以句号结尾

## 开发规范

- 新功能开发遵循 [feature.prompt.md](prompts/feature.prompt.md) 流程
- Bug 修复遵循 [bugfix.prompt.md](prompts/bugfix.prompt.md) 流程
- 测试范围：仅后端接口（`backend/src/**/*.test.ts`），不涉及前端
