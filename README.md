# ai.sh

> 一键式免费打造 AI 时代的个人站。

## 快速开始

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

交互式引导你完成：Supabase 登录 → 创建项目 → 数据库迁移 → API 密钥 → Edge Function 部署 → `.env` 生成。

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

---

## License

[Apache 2.0](./LICENSE)
