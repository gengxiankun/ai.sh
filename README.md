# ai.sh

## Overview

打造你的 AI 个人站——展示简历、作品和动态。访客可通过终端命令浏览，或直接与 AI 对话获取信息。你还可上传文档（简历、报告等）让 AI 辅助回答。全部内容通过管理后台在线编辑，无需改代码。免费部署，开箱即用。

## Features

- **终端风格** — `/about`、`/projects` 等命令交互 + 自然语言聊天，Tab 补全、历史记录
- **AI 智能体** — 多轮 Tool Calling、流式输出，支持 DeepSeek / Kimi / GLM / Qwen / 自定义
- **文件上传** — 上传 `.md` / `.pdf` 到对话，AI 基于文件内容回答
- **Skill 系统** — Claude Code 风格技能：QA 助手、Web Scraper、Admin 后台管理
- **RAG 知识库** — pgvector 向量检索，语义搜索、文档增删改
- **用户认证** — Supabase Auth 登录注册，聊天历史持久化，管理员权限
- **免费部署** — GitHub Pages + Supabase 免费层，零成本

## Deployment

### 1. Fork

Fork 本仓库到你的 GitHub 账号下。

### 2. Clone 到本地

```bash
git clone https://github.com/<your-username>/ai.sh
cd ai.sh
npm install
```

### 3. 初始化

```bash
npm run setup
```

### 4. 配置 GitHub Secrets

将 `.env` 中的变量设置到仓库的 **Settings → Secrets and variables → Actions → Secrets**：

| Secret | 值来源（`.env` 对应字段） |
|--------|---------------------------|
| `VITE_SUPABASE_URL` | `.env` 中的 `VITE_SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | `.env` 中的 `VITE_SUPABASE_ANON_KEY` |
| `VITE_ADMIN_EMAIL` | `.env` 中的 `VITE_ADMIN_EMAIL` |

### 5. Push

```bash
git add -A
git commit -m "init"
git push
```

### 6. 配置 GitHub Pages

进入仓库 **Settings → Pages**，Source 选 **GitHub Actions**。

推送后 Actions 自动构建部署，站点地址为 `https://<your-username>.github.io/ai.sh/`。

## License

[Apache 2.0](./LICENSE)
