# Word Master 🦋

> 一个爸爸为了让孩子真正记住英语单词而写的 App。

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev/)
[![Tests](https://img.shields.io/badge/Tests-91%20passed-brightgreen)](#测试)

---

## 为什么要做这个

孩子背单词，买了市面上主流的背词硬件，打卡完成率很高——但一合上机器，单词还是想不起来。

问题出在哪？**选择题骗了我们**。

大多数背单词 App 的测验本质上是"认脸"：屏幕上同时摆出 A、B、C、D 四个选项，孩子只要在选项里认出那个熟悉的词就算"会了"。但真正的考试没有这四个选项——老师念出 *apple*，你得从脑子里自己召回"苹果"这个词；老师说"苹果"，你得拼出 a-p-p-l-e。

这是两种完全不同的记忆。**认识 ≠ 能回忆 ≠ 能输出**。

另一个问题是：孩子背单词时，嘴从来不动。记忆是多通道的，只用眼睛看而不开口说，效率只发挥了一部分。

Word Master 就是为了解决这两个问题而生的。

---

## 和同类产品的核心区别

|  | 百词斩 / 多数 App | Word Master |
|--|-----------------|-------------|
| 测验方式 | 四选一选择题 | 无选项，自己开口说或手动输入 |
| 判定标准 | 认出选项 | 真正能回忆并表达出来 |
| 是否要求开口 | ❌ | ✅ 语音输入，孩子必须说出来 |
| 记忆路径 | 认知（看）| 认知 → 回忆 → 拼写，三阶段递进 |
| 复习时机 | 固定频率或手动 | 艾宾浩斯科学间隔，自动调度 |
| 答案判定 | 精确匹配 | AI 语义理解，近义词也算对 |

---

## 产品特色

### 🔒 三阶段闭环，不留漏洞

每个单词必须通过三关才算真正掌握：

```
① 英译中（认知）  →  ② 中译英（回忆）  →  ③ 拼写（输出）
```

前一关未稳定达标，后一关不会解锁。每关正确率达到 80% 才算过关，答错的词重新放回队列，直到答对为止。孩子无法靠运气蒙混过关，也无法跳过最难的拼写关。

### 🎤 开口说，不只是点屏幕

中译英和拼写阶段支持**语音输入**，孩子对着手机说出答案，讯飞语音识别把声音转成文字再判题。让背单词这件事同时调动眼、耳、口，记忆效果更扎实。

### 🤖 AI 判题，不死扣拼写

背单词的目的是理解和运用，不是死记字母顺序。答案判定使用本地运行的多语言语义模型，"automobile" 和 "car" 都能判定为正确。没有网络时自动降级为关键词匹配，始终可用。

### 🧠 艾宾浩斯间隔，每天只背该背的

系统根据每个词的记忆状态自动安排复习时机，不用手动管理：

| 答对后 | 下次出现 |
|--------|---------|
| 首次 | 当天巩固 |
| 第 1 次 | +1 天 |
| 第 2 次 | +3 天 |
| 第 3 次 | +7 天 |
| 第 4 次 | +14 天 |
| 第 5 次 | +30 天后长期记忆 |

每天打开 App，复习到期的词自动出现，当日任务完成即可关闭，不会无休止刷题。

### 🔊 听准发音，边学边听

词卡展示时自动播放单词发音，测验过程中随时可以点击重听。讯飞 TTS 合成，发音自然准确。

### 🐾 宠物养成，坚持有奖励

完成今日任务可以喂宠物，宠物随着掌握的词汇量成长：

```
🥚 神秘蛋 → 🐣 幼崽 → 🐥 少年 → 🐦 青年 → 🦅 成年 → 🦋 传说
```

连续答对有零食奖励，商店可以用金币购买道具。让孩子有理由每天主动打开 App。

### 📚 老师发什么，导入什么

直接导入老师下发的单词表（`.txt` 格式），无需手动录入。AI 自动为每个词条生成双语例句，学习时有上下文，不只是孤立的词。

---

## 运行平台

Web H5，手机浏览器即可访问，无需下载 App。

---

## 技术实现

| 层 | 技术 |
|----|------|
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS |
| 后端 | Node.js + Express + TypeScript |
| 数据库 | SQLite（零配置，单文件，可直接备份） |
| 语音识别 | 讯飞 WebSocket STT API |
| 语音合成 | 讯飞 WebSocket TTS API |
| 语义判题 | `@xenova/transformers` 本地推理（无需 GPU，无需联网） |
| AI 例句生成 | DeepSeek API |
| 测试 | Vitest + Supertest（91 个集成测试） |

---

## Docker 部署

### 环境要求

- Docker 20.10+
- Docker Compose v2（`docker compose` 命令）

### 快速部署（无需克隆仓库）

只需两个文件即可部署，镜像由 GitHub Actions 自动构建：

```bash
# 下载配置文件
curl -o docker-compose.yml https://raw.githubusercontent.com/armink/word-master/main/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/armink/word-master/main/backend/.env.example

# 按需编辑 .env 填入讯飞 API Key（可选，不填语音功能不可用）
# nano .env

# 启动
docker compose up -d
```

启动完成后访问 `http://服务器IP:3000` 即可使用。首次启动会自动下载语义模型（~85MB），稍候片刻即可正常使用。

### 配置环境变量

编辑 `.env` 文件：

```env
# 讯飞语音（STT / TTS）— 不配置则语音功能不可用，其余功能正常
XUNFEI_APP_ID=你的AppID
XUNFEI_API_KEY=你的APIKey
XUNFEI_API_SECRET=你的APISecret

# DeepSeek（AI 例句生成）— 可选
DEEPSEEK_API_KEY=你的APIKey
```

讯飞 API 申请地址：[https://www.xfyun.cn](https://www.xfyun.cn)

### 数据持久化

用户数据（词本、学习记录）和语义模型缓存存储在 Docker 管理的卷中，重启、重建容器后数据不会丢失：

```bash
# 查看数据实际存储位置
docker volume inspect word-master_sqlite-data

# 备份数据库
docker run --rm \
  -v word-master_sqlite-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/word-master-backup.tar.gz /data
```

### 常用运维命令

```bash
# 停止服务
docker compose down

# 更新到最新版本（拉取最新镜像，无需重新构建）
docker compose pull
docker compose up -d

# 查看运行状态
docker compose ps

# 查看实时日志
docker compose logs -f app
```

> ⚠️ **不要使用 `docker compose down -v`**，`-v` 参数会同时删除数据卷，导致所有学习数据丢失。

---

## 本地开发

想要修改源码、参与贡献或在本地运行？请参阅 [开发指南](docs/development.md)，涵盖：

- 环境安装与启动
- 词表导入格式
- 项目结构说明
- 测试与覆盖率

---

## 贡献

欢迎 Issue 和 Pull Request。提交代码前请确保：

1. `npm test` 全部通过
2. 遵循 [提交规范](COMMIT_CONVENTION.md)（Conventional Commits）
3. 修复 Bug 时请先添加对应测试用例（参考 `.github/prompts/bugfix.prompt.md`）

---

## 许可证

本项目基于 [Apache License 2.0](LICENSE) 开源。

```
Copyright 2024 Word Master Contributors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
```
