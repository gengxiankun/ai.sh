# ai.sh 技术架构解析

一个没有后端的 AI 个人站点，如何做到对话即功能、零服务器成本、插件化扩展。

---

## 架构总览

```
┌──────────────────────────────────────────────────────┐
│  GitHub Pages (Static Hosting)                       │
│  ┌────────────────────────────────────────────────┐  │
│  │  React 19 + TypeScript + Vite + Tailwind CSS 4 │  │
│  │  ┌────────────┐ ┌───────────┐ ┌─────────────┐  │  │
│  │  │ Agent Loop │ │ Skill     │ │ Command      │  │  │
│  │  │ + 渐进披露  │ │ Plugin    │ │ System       │  │  │
│  │  └─────┬──────┘ └─────┬─────┘ └──────┬───────┘  │  │
│  │        │               │               │         │  │
│  │  ┌─────┴───────────────┴───────────────┴──────┐  │  │
│  │  │  Progressive Disclosure Router             │  │  │
│  │  └────────────────────┬──────────────────────┘  │  │
│  └───────────────────────┼─────────────────────────┘  │
└──────────────────────────┼────────────────────────────┘
                           │ HTTPS
┌──────────────────────────┼────────────────────────────┐
│  Supabase (Backend)      │                            │
│  ┌───────────────────────┴─────────────────────────┐  │
│  │  Edge Function (/functions/v1/chat)             │  │
│  │  ┌──────────┐ ┌───────────┐ ┌────────────────┐  │  │
│  │  │ LLM      │ │ Embedding │ │ Generic Proxy  │  │  │
│  │  │ Proxy    │ │ (Jina V3) │ │ (Skill APIs)   │  │  │
│  │  └──────────┘ └───────────┘ └────────────────┘  │  │
│  └─────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────┐  │
│  │  PostgreSQL + pgvector + HNSW                   │  │
│  │  ┌──────────┐ ┌───────────┐ ┌────────────────┐  │  │
│  │  │ RLS      │ │ RPC       │ │ invite_codes   │  │  │
│  │  │ Policies │ │ consume   │ │ (quota track)  │  │  │
│  │  └──────────┘ └───────────┘ └────────────────┘  │  │
│  └─────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

前端 React SPA 部署在 GitHub Pages，Supabase 免费层提供数据库、鉴权和唯一一个 Edge Function。零服务器、零运维。

---

## 一、Agent Loop —— 渐进式披露 + 多轮工具调用

传统做法是把所有 AI 能力（skill）的 prompt 和 tool 一次性发给 LLM。当有多个 skill 时 prompt 迅速膨胀，浪费大量 token，LLM 也容易选错工具。

ai.sh 采用**两阶段渐进式披露**：

```
用户消息
  ↓
阶段 1 — LLM 路由 (轻量 ~200 token)
  System: "你是 skill 路由器。可用 skill: QA, Scraper, Admin..."
  User:   "帮我搜索最新 AI 新闻"
  LLM → "scraper"
  ↓
阶段 2 — 展开匹配 skill (只发选中 skill 的完整 prompt + tools)
  System: "你是 Web Scraper 助手...[完整 prompt]"
  Tools:  [fetch_url] (只有 Scraper 的工具)
  ↓
Agent Loop: 最多 5 轮 tool calling
  LLM 调用 tool → 执行 → 追加 tool 结果 → LLM 再决策
  ↓
最终回答 (streaming)
```

| | 全量发送（旧） | 渐进式披露（新） |
|---|---|---|
| system prompt | ~5KB (3 个 skill 全文) | ~200B 路由 + 1 个 skill 全文 |
| tools | 全部 21 个 | 匹配 skill 的 5-6 个 |
| LLM 选错工具 | 经常 | 不会 |

**实现细节**：

每轮 API 调用的 `usage.total_tokens` 精确统计——路由阶段、agent loop 每轮、最终 streaming 回答，三段累加等于 DeepSeek 的实际计费。这个数据用于邀请码额度追踪。

```typescript
let totalUsage = 0

// 阶段 1: LLM 路由
const { id, usage } = await routeSkill(userMessage, skillsMeta)
totalUsage += usage

// 阶段 2: 只加载匹配 skill 的 tools + prompt
const matchedSkill = skills.find(s => s.id === id)
const matchedTools = matchedSkill.scripts.map(s => s.definition)

// Agent loop
while (round < MAX_ROUNDS) {
  const res = await callAPI(payload, matchedTools)
  totalUsage += res.usage.total_tokens
  if (!msg.tool_calls?.length) break
  const results = await executeToolCalls(msg.tool_calls, matchedScripts)
  payload.push(...results)
}

return { text: msg.content, usage: totalUsage }
```

---

## 二、Skill 插件系统

Skill 是自包含的 AI 能力单元：一个 YAML 元数据文件 + 一组 JS 脚本。通过 GitHub 仓库 `plugins.ai.sh` 作为注册中心分发。

### 插件格式

```
plugins.ai.sh/skills/tavily-search/
├── SKILL.md             # YAML front-matter + Markdown prompt
├── scripts/
│   ├── manifest.json    # tool 名 → 脚本文件 + 参数定义
│   └── tavily_search.js # 可执行脚本 (new Function() 沙箱)
```

```yaml
# SKILL.md
---
name: Tavily Search
description: 实时网页搜索
icon: data:image/svg+xml;base64,...
secrets:
  Authorization: Bearer <your-tavily-api-key>
---

你是实时搜索助手...
```

```json
// manifest.json
{
  "tavily_search": {
    "file": "tavily_search.js",
    "description": "搜索互联网获取实时信息",
    "params": { "query": "搜索关键词", "max_results": "最大结果数" }
  }
}
```

manifest 中的 params 在加载时转换为 OpenAI function calling 标准格式：

```typescript
{
  type: 'function',
  function: {
    name: 'tavily_search',
    description: '搜索互联网获取实时信息',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' }
      },
      required: ['query']
    }
  }
}
```

### 安装与更新

```
npm run plugin-skill
  → 远程注册表 → 多选勾选 → 下载到 public/skills/ → 写入 registry.json
  → 刷新即生效

已安装的 skill 显示版本号，远程更新自动标识：
  ● QA [已安装]
  ● Web Scraper [更新 v1.0.0 → v1.1.0]  ← 有新版本
```

安装时自动检测 SKILL.md 中的 `secrets` 声明，提示输入 API key 并通过 `npx supabase secrets set` 部署到 Edge Function。

### 运行时加载

所有 skill（内置 + 插件）统一从 `public/skills/registry.json` 加载。`fetchSkills()` 启动时读取注册表，按需加载完整内容。admin skill 仅对管理员可见：

```typescript
async function getInstalledSkillDirs(includeAdmin: boolean) {
  const reg = await fetch('skills/registry.json').then(r => r.json())
  return Object.entries(reg.skills)
    .filter(([, entry]) => includeAdmin || !entry.admin)  // 过滤 admin skill
    .map(([id]) => id)
}
```

---

## 三、通用 API 代理 —— 解耦 Edge Function

每个 skill 调用外部 API 时，不直接 fetch，而是通过 Edge Function 的**通用 proxy** 中转。API key 不暴露到前端：

```javascript
// skill 脚本：只写 __SECRET__ 占位符
var res = await fetch(WORKER_URL, {
  body: JSON.stringify({
    proxy: true,
    proxy_skill_id: 'tavily-search',
    proxy_url: 'https://api.tavily.com/search',
    proxy_headers: { Authorization: '__SECRET__' },
  })
})
```

Edge Function 自动替换占位符：

```typescript
if (body.proxy && body.proxy_url) {
  const headers = { ...body.proxy_headers }
  for (const [key, value] of Object.entries(headers)) {
    if (value === '__SECRET__') {
      const secretKey = `SKILL_${skillId}_${key}`.toUpperCase().replace(/-/g, '_')
      headers[key] = Deno.env.get(secretKey) ?? ''
    }
  }
  const res = await fetch(body.proxy_url, { headers, body: body.proxy_body })
  return new Response(res.body)
}
```

**新增任何 API skill 完全不碰 Edge Function 代码**，只需设一个 Supabase secret。

---

## 四、RAG 知识库 —— 分块 + HNSW 向量搜索

完整的检索增强生成系统：文档上传 → 分块 → Jina V3 embedding → pgvector 存储 → HNSW 近似搜索。

### 分块策略

长文档不能用一个向量表示——语义被稀释，搜索命中率极低。采用**递归语义分块**：

```
输入文本 (3000 字)
  ↓
按 \n\n 分割段落
  ↓
每个段落 ≤ 500 字符 → 直接作为一个 chunk
每个段落 > 500 字符 → 按句号分句，组装到接近 500 字符
  ↓
相邻 chunk 重叠 50 字符（保证跨 chunk 语义连续性）
  ↓
输出: [{ index: 0, content: "段落1" }, { index: 1, content: "段落1尾部+段落2开头" }, ...]
```

### 表结构

```
rag_documents (id, title, source, created_at)          ← 文档元数据
  └── rag_chunks (id, document_id, chunk_index, content, embedding)
      └── HNSW index ON embedding vector_cosine_ops   ← 近似最近邻搜索
```

删除文档时 `ON DELETE CASCADE` 自动清理所有 chunk。

### 搜索流程

```sql
CREATE FUNCTION search_rag_docs(query_embedding VECTOR(1024), ...)
RETURNS TABLE(id INT, title TEXT, content TEXT, similarity FLOAT)
AS $$
  SELECT DISTINCT ON (d.id)
    d.id, d.title, c.content,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM rag_chunks c
  JOIN rag_documents d ON d.id = c.document_id
  WHERE 1 - (c.embedding <=> query_embedding) > 0.5
  ORDER BY d.id, similarity DESC
  LIMIT 5;
$$;
```

关键设计：搜索 chunk 表获取最相似片段 → 按文档 ID 去重保留最高分 → 返回文档标题和最佳匹配 chunk 的文本。匹配阈值 0.5，过滤无关结果。

### Embedding 生成

前端通过 Edge Function 调用 Jina V3 API，区分查询和文档两种 task（Jina 支持非对称 embedding，区分后搜索质量更好）：

```typescript
// 查询 embedding (retrieval.query)
const queryEmb = await getEmbedding(userQuery, 'retrieval.query')

// 文档 embedding (retrieval.passage)
const docEmb = await getEmbedding(documentContent, 'retrieval.passage')

// Edge Function 透传
fetch('https://api.jina.ai/v1/embeddings', {
  body: { model: 'jina-embeddings-v3', input: text, dimensions: 1024, task }
})
```

| | 全表扫描（旧） | HNSW 索引（新） |
|---|---|---|
| 100 条文档 | ~20ms | ~2ms |
| 1000 条文档 | ~100ms | ~3ms |
| 10000 条文档 | ~1s | ~5ms |

---

## 五、邀请码 + 词元额度追踪

非管理员用户通过邀请码访问 AI 聊天，每次对话消耗量化额度。

### 流程

```
用户打开 ?invite=AbCd1234 → 自动验证 → 存入 localStorage → 开始聊天
  ↓
每次对话后: consume_invite(token, usage)
  ↓
PostgreSQL RPC 函数 (原子操作):
  SELECT token_used, token_quota WHERE token = ? AND expires_at > NOW()
  IF used + usage > quota → 拒绝
  UPDATE token_used = used + usage
  ↓
状态栏实时显示: 词元 1,234/5,000
```

### 为什么用 RPC 而非 public UPDATE 策略

```
用 public UPDATE 策略:
  恶意用户 PATCH token_used=0    ← 重置额度 ❌
  恶意用户 PATCH token_quota=99999 ← 提额 ❌

用 RPC 函数 (SECURITY DEFINER):
  只能调 consume_invite(token, usage)
  函数内部检查过期 + 超额
  SELECT + UPDATE 原子操作，无法绕过
```

### 管理

```
/invite-code add    → 弹窗设置描述、词元额度、有效天数 → 生成带 token 的 URL
/invite-code        → 列表显示：名称 / token | 用量 | 过期时间 + 编辑/删除/复制按钮
/invite-code verify → 手动输入邀请码验证
```

---

## 六、命令系统 + 子命令补全

终端风格的命令交互，支持子命令：

```
键入 /                      → 下拉列表 (顶层命令)
键入 /invite-code           → 匹配 /invite-code
键入 /invite-code [空格]    → 只显示 add、verify (子命令)
Tab / →                     → 自动补全
↑↓                          → 导航
```

命令列表根据状态动态过滤：

```typescript
const visibleCommands = ALL_COMMANDS.filter(cmd => {
  if (loggedIn && (cmd === 'login' || cmd === 'register')) return false
  if (!loggedIn && cmd === 'logout') return false
  if (!isAdmin && ADMIN_SUBCOMMANDS.includes(cmd)) return false
  return true
})
```

---

## 七、前端设计要点

- **零图标库依赖** — skill 图标用 `data:image/svg+xml;base64,...` 内联，`stroke="currentColor"` 自适应文字颜色，`SkillIcon` 组件解码后 `dangerouslySetInnerHTML` 渲染 SVG
- **ref-sync 模式** — 所有 state 同步到 ref (`*.current = *`)，确保键盘事件闭包中读到最新值，无需反复注册监听器
- **Tailwind CSS v4** — 配置文件在 CSS 中 (`@theme` blocks)，无 PostCSS
- **Plus 按钮** — 点击弹出上传文件 / 技能浏览，`position: fixed` + `getBoundingClientRect()` 突破 `overflow-hidden` 裁剪
- **StatusBar** — 实时显示用户、ADMIN 标签、LLM 模型、词元用量
- **Skill 注册表** — 启动时从 `registry.json` 加载，动态确定加载哪些 skill，admin 自动隔离

---

## 八、部署

```bash
npm run setup   # 交互式: 选 Supabase 项目 → LLM → skill 选择 → .env → 迁移 → Edge Function
npm run dev     # Vite HMR 本地开发
npm run build   # tsc -b && vite build
```

push 到 `main` → GitHub Actions 自动部署到 GitHub Pages。

```yaml
# .github/workflows/deploy.yml
- run: npx vite build --base="/${{ github.event.repository.name }}/"
- uses: peaceiris/actions-gh-pages@v4
```

---

## 核心设计权衡

| 选择 | 替代方案 | 理由 |
|------|----------|------|
| `new Function()` 沙箱 | Web Worker / VM | 个人站点，skill 自编写 |
| 前端直调 Supabase REST + RLS | BFF 层 | 零服务器，RLS 提供安全边界 |
| 词元额度 PostgreSQL RPC | Redis / Edge Function | 原子操作、免费、零延迟 |
| GitHub 作为插件注册中心 | npm registry | 零成本、版本天然跟踪 |
| DeepSeek API | OpenAI / Claude | 成本低、中文好 |
| 渐进式披露 LLM 路由 | 关键词匹配 / 全量发送 | token 省、准确度高 |
| Jina V3 分块 embedding | OpenAI ada-002 / 全文存储 | 语义分块、非对称检索 |
| HNSW 向量索引 | IVFFlat / 全表扫描 | 查询速度数量级提升 |

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端框架 | React 19 + TypeScript |
| 构建 | Vite 8 |
| 样式 | Tailwind CSS v4 |
| 后端 | Supabase (PostgreSQL + pgvector + Edge Functions) |
| LLM | DeepSeek (Chat + Embedding) |
| 部署 | GitHub Pages |
| 插件分发 | GitHub raw (plugins.ai.sh) |

---

**一句话**: ai.sh 全站只跑 1 个 Edge Function、1 个 PostgreSQL。Agent loop、Skill 沙箱、渐进式路由、RAG 分块搜索全在浏览器端完成，后端只做 proxy 和 storage。
