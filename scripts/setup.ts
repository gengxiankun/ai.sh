import * as p from "@clack/prompts"
import { writeFileSync, readFileSync, existsSync } from "node:fs"
import { execSync } from "node:child_process"

function supabase(args: string): string {
  return execSync(`npx supabase ${args}`, {
    encoding: "utf-8",
    stdio: ["inherit", "pipe", "pipe"],
    timeout: 120000,
  })
}

function supabaseJSON(args: string): unknown {
  const out = supabase(`${args} --output-format json`)
  const json = out.replace(/[\u001b\u009b][[()#;?]*[A-Za-z]/g, "").trim()
  const match = json.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`Failed to parse JSON from supabase ${args}`)
  return JSON.parse(match[0])
}

async function main() {
  p.intro("ai.sh — 项目初始化")

  // ==================== Step 1: 登录 ====================
  const s = p.spinner()
  let loggedIn = false
  try {
    supabaseJSON("orgs list")
    loggedIn = true
  } catch {
    // 未登录，需要 login
  }

  if (!loggedIn) {
    s.start("登录 Supabase（浏览器将自动打开）...")
    execSync("npx supabase login", { stdio: "inherit", timeout: 120000 })
    s.stop("登录完成")
  } else {
    s.start("已登录，跳过")
    s.stop("已登录")
  }

  // ==================== Step 2: 获取组织 ====================
  let orgId = ""
  try {
    const orgs = supabaseJSON("orgs list") as {
      organizations?: { id: string; name: string }[]
    }
    const list = orgs?.organizations ?? []
    if (list.length === 0) {
      p.cancel("未找到组织。请先在 Supabase Dashboard 创建组织。")
      process.exit(1)
    }
    if (list.length === 1) {
      orgId = list[0].id
      p.note(`组织: ${list[0].name}`, "自动选择")
    } else {
      const choice = await p.select({
        message: "选择组织",
        options: list.map((o) => ({ value: o.id, label: o.name })),
      })
      if (p.isCancel(choice)) process.exit(0)
      orgId = choice as string
    }
  } catch {
    p.cancel("获取组织列表失败")
    process.exit(1)
  }

  // ==================== Step 3 & 4: 获取项目 + 选择/创建 ====================
  let projectRef = ""
  let dbPassword = ""

  const projects =
    (
      supabaseJSON("projects list") as {
        projects?: { ref: string; name: string; region: string }[]
      }
    )?.projects ?? []

  const projChoice = await p.select({
    message: "选择 Supabase 项目",
    options: [
      ...projects.map((pr) => ({
        value: pr.ref,
        label: pr.name,
        hint: `${pr.ref} · ${pr.region}`,
      })),
      { value: "__create__", label: "+ 创建新项目" },
    ],
  })
  if (p.isCancel(projChoice)) process.exit(0)

  if (projChoice === "__create__") {
    const name = await p.text({ message: "项目名称" })
    if (p.isCancel(name)) process.exit(0)
    if (!name) {
      p.cancel("项目名称不能为空")
      process.exit(1)
    }

    const region = await p.select({
      message: "选择区域（推荐东京）",
      options: [
        { value: "ap-northeast-1", label: "东京 (Northeast Asia)", hint: "推荐 · 国内延迟最低" },
        { value: "ap-southeast-1", label: "新加坡 (Southeast Asia)" },
        { value: "us-west-1", label: "美西 (West US)" },
        { value: "ap-northeast-2", label: "首尔 (Northeast Asia 2)" },
        { value: "eu-central-1", label: "法兰克福 (Central EU)" },
      ],
    })
    if (p.isCancel(region)) process.exit(0)

    dbPassword = (await p.password({ message: "数据库密码（至少 8 位）" })) as string
    if (p.isCancel(dbPassword)) process.exit(0)
    if (!dbPassword || dbPassword.length < 8) {
      p.cancel("密码至少 8 位")
      process.exit(1)
    }

    const cs = p.spinner()
    cs.start(`正在创建项目 "${name}"... (约 1 分钟)`)
    try {
      execSync(
        `npx supabase projects create "${name}" --org-id ${orgId} --db-password "${dbPassword}" --region ${region}`,
        { stdio: "inherit", timeout: 180000 },
      )
      const afterCreate = supabaseJSON("projects list") as {
        projects?: { ref: string; name: string }[]
      }
      const created = afterCreate?.projects?.find((p) => p.name === name)
      projectRef = created?.ref ?? ""
      if (!projectRef) throw new Error("无法获取项目 ref")
      cs.stop(`项目已创建: ${name} (${projectRef})`)
    } catch (e) {
      cs.stop("创建失败")
      p.cancel(`创建失败: ${e}`)
      process.exit(1)
    }
  } else {
    projectRef = projChoice as string
    dbPassword = (await p.password({
      message: "数据库密码（回车跳过，跳过将不执行迁移）",
    })) as string
    if (p.isCancel(dbPassword)) process.exit(0)
  }

  if (!projectRef) {
    p.cancel("获取项目 ref 失败")
    process.exit(1)
  }

  // ==================== Step 5: link 项目 ====================
  const ls = p.spinner()
  ls.start("链接项目...")
  try {
    const linkArgs = dbPassword
      ? `link --project-ref ${projectRef} --password "${dbPassword}"`
      : `link --project-ref ${projectRef}`
    supabase(linkArgs)
    ls.stop("项目已链接")
  } catch {
    ls.stop("link 失败（可能已链接），跳过")
  }

  // ==================== Step 6: 管理员邮箱 ====================
  const adminEmail = await p.text({
    message: "管理员邮箱",
    placeholder: "your@email.com",
    validate: (v) => (!v?.includes("@") ? "请输入有效邮箱" : undefined),
  })
  if (p.isCancel(adminEmail)) process.exit(0)
  if (!adminEmail) {
    p.cancel("邮箱不能为空")
    process.exit(1)
  }

  // 替换迁移 SQL 模板中的 ADMIN_EMAIL 占位符，生成迁移文件
  const sqlTemplate = "supabase/migrations/20250706000002_init.sql.template"
  const sqlPath = "supabase/migrations/20250706000002_init.sql"
  try {
    let sql = readFileSync(sqlTemplate, "utf-8")
    sql = sql.replace(/'ADMIN_EMAIL'/g, `'${adminEmail}'`)
    writeFileSync(sqlPath, sql)
  } catch {
    p.note("迁移 SQL 生成失败，请手动替换 ADMIN_EMAIL", "警告")
  }

  // ==================== Step 7: 执行数据库迁移 ====================
  if (dbPassword) {
    const ms = p.spinner()
    ms.start("执行数据库迁移...")
    try {
      supabase(`db push --yes --password "${dbPassword}"`)
      ms.stop("数据库迁移完成")
    } catch {
      ms.stop("迁移执行失败，请稍后手动执行:\n  npx supabase db push --yes")
    }
  } else {
    p.note("未提供数据库密码，跳过迁移。稍后手动执行:\n  npx supabase db push --yes", "提示")
  }

  // ==================== Step 8: 获取 publishable key ====================
  let anonKey = ""
  try {
    const keys =
      (
        supabaseJSON("projects api-keys") as {
          keys?: { type: string; api_key: string }[]
        }
      )?.keys ?? []
    const publishable = keys.find(
      (k: { type: string }) => k.type === "publishable",
    )
    anonKey = publishable?.api_key ?? ""
  } catch {
    // fallback
  }

  if (!anonKey) {
    anonKey = (await p.text({
      message: "Supabase Anon Key (publishable key)",
      placeholder: "sb_publishable_...",
    })) as string
    if (p.isCancel(anonKey)) process.exit(0)
  }

  const supabaseUrl = `https://${projectRef}.supabase.co`

  // ==================== Step 9: 对话模型配置 ====================
  p.note("对话模型配置", "Step 1/2")

  const providers: Record<string, { name: string; baseUrl: string; models: string[] }> = {
    deepseek: { name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", models: ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-chat", "deepseek-reasoner"] },
    moonshot: { name: "月之暗面 (Kimi)", baseUrl: "https://api.moonshot.cn/v1", models: ["kimi-k3", "kimi-k2.6", "moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"] },
    zhipu:    { name: "智谱 (GLM)",       baseUrl: "https://open.bigmodel.cn/api/paas/v4", models: ["glm-4-plus", "glm-4-flash", "glm-4-air"] },
    qwen:     { name: "通义千问 (Qwen)",    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", models: ["qwen-turbo", "qwen-plus", "qwen-max"] },
  }

  const providerKey = await p.select({
    message: "选择 LLM 提供商",
    options: [
      ...Object.entries(providers).map(([key, info]) => ({
        value: key,
        label: info.name,
      })),
      { value: "custom", label: "自定义" },
    ],
  })
  if (p.isCancel(providerKey)) process.exit(0)

  let llmBaseUrl = ""
  let llmModel = ""
  let llmProvider = ""

  if (providerKey === "custom") {
    llmBaseUrl = (await p.text({
      message: "Base URL",
      placeholder: "https://api.openai.com/v1",
    })) as string
    if (p.isCancel(llmBaseUrl)) process.exit(0)
    llmModel = (await p.text({
      message: "Model",
      placeholder: "gpt-4o",
    })) as string
    if (p.isCancel(llmModel)) process.exit(0)
    if (!llmBaseUrl || !llmModel) {
      p.cancel("URL 和 Model 不能为空")
      process.exit(1)
    }
    llmProvider = (await p.text({
      message: "Provider display name（如 OpenAI，回车跳过）",
      placeholder: "OpenAI",
    })) as string
  } else {
    const info = providers[providerKey as string]
    if (!info) process.exit(1)
    llmBaseUrl = info.baseUrl
    llmProvider = info.name

    const modelChoice = await p.select({
      message: `选择 ${info.name} 模型`,
      options: info.models.map((m) => ({ value: m, label: m })),
    })
    if (p.isCancel(modelChoice)) process.exit(0)
    llmModel = modelChoice as string
  }

  const llmApiKey = await p.password({ message: `${llmProvider || "LLM"} API Key` })
  if (p.isCancel(llmApiKey)) process.exit(0)
  if (!llmApiKey) {
    p.cancel("API Key 不能为空")
    process.exit(1)
  }

  // ==================== Step 10: 向量模型配置 ====================
  p.note("向量模型配置", "Step 2/2")
  const jinaKey = await p.password({ message: "Jina API Key" })
  if (p.isCancel(jinaKey)) process.exit(0)
  if (!jinaKey) {
    p.cancel("API Key 不能为空")
    process.exit(1)
  }

  // ==================== Step 11: 写入 .env ====================
  const envContent = `VITE_SUPABASE_URL=${supabaseUrl}
VITE_SUPABASE_ANON_KEY=${anonKey}
VITE_ADMIN_EMAIL=${adminEmail}
`

  if (existsSync(".env")) {
    const overwrite = await p.confirm({ message: ".env 已存在，是否覆盖？" })
    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel("已取消")
      process.exit(0)
    }
  }

  writeFileSync(".env", envContent)
  p.note(`${supabaseUrl}\n${llmProvider} · ${llmModel}`, ".env 已生成")

  // ==================== Step 12: ASCII Logo ====================
  const logoName = await p.text({ message: "ASCII Logo 显示名称（回车跳过）" })
  if (!p.isCancel(logoName) && logoName) {
    try {
      const figlet = await import("figlet")
      const art = figlet.default.textSync(logoName.toUpperCase(), {
        font: "ANSI Shadow",
      })
      if (art) {
        writeFileSync("src/components/logo.txt", art)
        p.note(logoName.toUpperCase(), "Logo 已更新")
      }
    } catch {
      // skip
    }
  }

  // ==================== Step 13: 部署 Edge Function ====================
  const ds = p.spinner()
  ds.start("设置密钥...")
  try {
    supabase(`secrets set LLM_API_KEY='${llmApiKey}'`)
    supabase(`secrets set LLM_BASE_URL='${llmBaseUrl}'`)
    supabase(`secrets set LLM_MODEL='${llmModel}'`)
    supabase(`secrets set LLM_PROVIDER='${llmProvider}'`)
    supabase(`secrets set JINA_API_KEY='${jinaKey}'`)
    ds.stop("密钥已设置")
  } catch {
    ds.stop("密钥设置失败，请稍后手动执行")
  }

  const fs = p.spinner()
  fs.start("部署 Edge Function...")
  try {
    execSync("npx supabase functions deploy chat", { stdio: "inherit", timeout: 120000 })
    fs.stop("Edge Function 已部署")
  } catch {
    fs.stop("部署失败，请稍后手动执行:\n  npx supabase functions deploy chat")
  }

  // ==================== 完成 ====================
  p.outro("初始化完成！运行 npm run dev 启动")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
