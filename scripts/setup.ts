import * as readline from "node:readline"
import { writeFileSync, readFileSync, existsSync } from "node:fs"
import { execSync } from "node:child_process"

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

function ask(q: string): Promise<string> {
  return new Promise((r) => rl.question(q, (a) => r(a.trim())))
}

function supabase(args: string): string {
  return execSync(`npx supabase ${args}`, {
    encoding: "utf-8",
    stdio: ["inherit", "pipe", "inherit"],
    timeout: 120000,
  })
}

function supabaseInteractive(args: string): void {
  execSync(`npx supabase ${args}`, {
    stdio: "inherit",
    timeout: 120000,
  })
}

function supabaseJSON(args: string): unknown {
  const out = supabase(`${args} --output-format json`)
  // 过滤掉 spinner 输出的 ANSI 转义序列，只提取 JSON 部分
  const json = out.replace(/[\u001b\u009b][[()#;?]*[A-Za-z]/g, "").trim()
  const match = json.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`Failed to parse JSON from supabase ${args}`)
  return JSON.parse(match[0])
}

async function select<T>(
  items: T[],
  label: (t: T, i: number) => string,
  extra: { label: string; value: string }[] = [],
): Promise<string> {
  console.log()
  items.forEach((t, i) => console.log(`  [${i + 1}] ${label(t, i)}`))
  extra.forEach((e, i) => console.log(`  [${items.length + i + 1}] ${e.label}`))

  const max = items.length + extra.length
  while (true) {
    const choice = await ask(`\n选择 (1-${max}): `)
    const n = Number(choice)
    if (n >= 1 && n <= items.length) return label(items[n - 1], n - 1)
    if (n > items.length && n <= max)
      return extra[n - items.length - 1].value
    console.log("无效选择，请重新输入")
  }
}

async function main() {
  console.log("\n🔧 Terminal Site — 项目初始化\n")

  // ==================== Step 1: 登录 ====================
  console.log("登录 Supabase...")
  try {
    supabaseInteractive("login")
  } catch {
    console.log("⚠️  登录失败或已登录，继续...")
  }

  // ==================== Step 2: 获取组织 ====================
  let orgId = ""
  try {
    const orgs = supabaseJSON("orgs list") as {
      organizations?: { id: string; name: string }[]
    }
    const list = orgs?.organizations ?? []
    if (list.length === 0) {
      console.log("未找到组织。请先在 Supabase Dashboard 创建组织。")
      console.log("https://supabase.com/dashboard/org/_/general")
      process.exit(1)
    }
    if (list.length === 1) {
      orgId = list[0].id
      console.log(`组织: ${list[0].name} (自动选择)`)
    } else {
      const label = await select(
        list,
        (o) => `${o.name} (${o.id})`,
      )
      orgId = label.match(/\(([^)]+)\)$/)?.[1] ?? list[0].id
    }
  } catch {
    console.log("⚠️  获取组织列表失败")
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

  const label = await select(
    projects,
    (p) => `${p.name}  (${p.ref})  [${p.region}]`,
    [{ label: "+ 创建新项目", value: "__create__" }],
  )

  if (label === "__create__") {
    // ==================== Step 5b: 创建新项目 ====================
    const name = await ask("\n项目名称: ")
    if (!name) {
      console.log("❌ 项目名称不能为空")
      process.exit(1)
    }

    const regions = [
      { id: "ap-northeast-1", label: "东京 (Northeast Asia)" },
      { id: "ap-southeast-1", label: "新加坡 (Southeast Asia)" },
      { id: "us-west-1", label: "美西 (West US)" },
      { id: "us-east-1", label: "美东 (East US)" },
      { id: "eu-west-1", label: "爱尔兰 (West EU)" },
      { id: "eu-central-1", label: "法兰克福 (Central EU)" },
      { id: "ap-south-1", label: "孟买 (South Asia)" },
      { id: "ap-southeast-2", label: "悉尼 (Australia)" },
      { id: "ap-northeast-2", label: "首尔 (Northeast Asia 2)" },
      { id: "sa-east-1", label: "圣保罗 (South America)" },
      { id: "ca-central-1", label: "加拿大 (Canada)" },
    ]

    console.log("\n可用区域（推荐东京，国内延迟最低）:")
    regions.forEach((r, i) => console.log(`  [${i + 1}] ${r.label} (${r.id})`))
    const regionChoice = await ask(`\n选择区域 (1-${regions.length}, 默认 1): `)
    const region =
      regions[Math.max(0, (Number(regionChoice) || 1) - 1)]?.id ??
      "ap-northeast-1"

    dbPassword = await ask("数据库密码 (至少 8 位): ")
    if (!dbPassword || dbPassword.length < 8) {
      console.log("❌ 密码至少 8 位")
      process.exit(1)
    }

    console.log(`\n正在创建项目 "${name}"... (可能需要 1-2 分钟)`)
    try {
      supabaseInteractive(
        `projects create "${name}" --org-id ${orgId} --db-password "${dbPassword}" --region ${region}`,
      )

      // 创建后重新获取项目列表，找到刚创建的项目
      const afterCreate = supabaseJSON("projects list") as {
        projects?: { ref: string; name: string }[]
      }
      const created = afterCreate?.projects?.find((p) => p.name === name)
      projectRef = created?.ref ?? ""
      if (!projectRef) throw new Error("无法获取项目 ref")
      console.log(`✅ 项目已创建: ${name} (${projectRef})`)
    } catch (e) {
      console.log(`❌ 创建失败: ${e}`)
      console.log("你可以手动在 Supabase Dashboard 创建后重新运行 setup。")
      process.exit(1)
    }
  } else {
    // 已选择已有项目 (label 格式: "name  (ref)  [region]")
    projectRef = label.match(/\(([a-z0-9]{20,})\)/)?.[1] ?? ""
    dbPassword = await ask("数据库密码 (回车跳过，跳过将不执行迁移): ")
  }

  if (!projectRef) {
    console.log("❌ 获取项目 ref 失败")
    process.exit(1)
  }

  // ==================== Step 5a/5b: link 项目 ====================
  try {
    const linkArgs = dbPassword
      ? `link --project-ref ${projectRef} --password "${dbPassword}"`
      : `link --project-ref ${projectRef}`
    supabase(linkArgs)
  } catch {
    console.log("⚠️  link 失败（可能已链接），跳过...")
  }

  // ==================== Step 5b2: 管理员邮箱 ====================
  console.log("\n--- 管理员配置 ---")
  const adminEmail = await ask("管理员邮箱 (你的 Supabase 登录邮箱): ")
  if (!adminEmail || !adminEmail.includes("@")) {
    console.log("⚠️  邮箱格式无效，请重新输入")
    process.exit(1)
  }

  // 替换迁移 SQL 模板中的 ADMIN_EMAIL 占位符，生成迁移文件
  const sqlTemplate = "supabase/migrations/20250706000002_init.sql.template"
  const sqlPath = "supabase/migrations/20250706000002_init.sql"
  try {
    let sql = readFileSync(sqlTemplate, "utf-8")
    sql = sql.replace(/'ADMIN_EMAIL'/g, `'${adminEmail}'`)
    writeFileSync(sqlPath, sql)
    console.log(`✅ 迁移 SQL 管理员邮箱已更新为: ${adminEmail}`)
  } catch {
    console.log("⚠️  迁移 SQL 生成失败，请手动替换 ADMIN_EMAIL")
  }

  // ==================== Step 5c: 执行数据库迁移 ====================
  if (dbPassword) {
    console.log("\n正在执行数据库迁移...")
    try {
      supabase(`db push --yes --password "${dbPassword}"`)
      console.log("✅ 数据库迁移完成")
    } catch {
      console.log("⚠️  迁移执行失败，请稍后手动执行:")
      console.log("     npx supabase db push --yes")
    }
  } else {
    console.log("\n⚠️  未提供数据库密码，跳过迁移。稍后手动执行:")
    console.log("     npx supabase db push --yes")
  }

  // ==================== Step 6: 获取 publishable key ====================
  console.log("\n正在获取 API Keys...")
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
    console.log("⚠️  自动获取 Key 失败")
    anonKey = await ask("请手动输入 Supabase Anon Key (publishable): ")
  }

  const supabaseUrl = `https://${projectRef}.supabase.co`

  // ==================== Step 7: 对话模型配置 ====================
  console.log("\n--- 对话模型配置 ---")

  const providers: Record<string, { name: string; baseUrl: string; models: string[] }> = {
    deepseek: { name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", models: ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-chat", "deepseek-reasoner"] },
    moonshot: { name: "月之暗面 (Kimi)", baseUrl: "https://api.moonshot.cn/v1", models: ["kimi-k3", "kimi-k2.6", "moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"] },
    zhipu:    { name: "智谱 (GLM)",       baseUrl: "https://open.bigmodel.cn/api/paas/v4", models: ["glm-4-plus", "glm-4-flash", "glm-4-air"] },
    qwen:     { name: "通义千问 (Qwen)",    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", models: ["qwen-turbo", "qwen-plus", "qwen-max"] },
  }

  const providerKeys = Object.keys(providers)
  const providerLabel = await select(
    providerKeys.map((k) => ({ key: k, ...providers[k] })),
    (p) => p.name,
    [{ label: "自定义", value: "custom" }],
  )

  let llmBaseUrl = ""
  let llmModel = ""

  if (providerLabel === "custom") {
    llmBaseUrl = await ask("Base URL (e.g. https://api.openai.com/v1): ")
    llmModel = await ask("Model (e.g. gpt-4o): ")
    if (!llmBaseUrl || !llmModel) {
      console.log("⚠️  URL 和 Model 不能为空")
      process.exit(1)
    }
  } else {
    const p = providers[providerLabel.toLowerCase()] ?? Object.values(providers).find((vv) => vv.name === providerLabel)
    if (!p) process.exit(1)
    llmBaseUrl = p.baseUrl

    const modelLabel = await select(
      p.models,
      (m) => m,
    )
    llmModel = modelLabel.replace(/\s*\(推荐\)\s*$/, "")
    console.log(`模型: ${llmModel}`)
  }

  const llmApiKey = await ask("\nLLM API Key: ")
  if (!llmApiKey) {
    console.log("⚠️  API Key 不能为空")
    process.exit(1)
  }

  // ==================== Step 8: 向量模型配置 ====================
  console.log("\n--- 向量模型配置 ---")
  console.log("Embedding: Jina (jina-embeddings-v3)")
  const jinaKey = await ask("Jina API Key: ")
  if (!jinaKey) {
    console.log("⚠️  API Key 不能为空")
    process.exit(1)
  }

  // ==================== Step 9: 写入 .env ====================
  const envContent = `VITE_SUPABASE_URL=${supabaseUrl}
VITE_SUPABASE_ANON_KEY=${anonKey}
VITE_ADMIN_EMAIL=${adminEmail}
VITE_LLM_MODEL=${llmModel}
`

  if (existsSync(".env")) {
    const overwrite = await ask("\n⚠️  .env 已存在，是否覆盖？(y/N): ")
    if (overwrite.toLowerCase() !== "y") {
      console.log("已取消")
      process.exit(0)
    }
  }

  writeFileSync(".env", envContent)
  console.log("\n✅ .env 已生成！")
  console.log(`   VITE_SUPABASE_URL=${supabaseUrl}`)
  console.log(`   VITE_SUPABASE_ANON_KEY=${anonKey}`)

  // ==================== Step 9b: ASCII Logo ====================
  const logoName = await ask(
    "\nASCII Logo 显示名称: ",
  )
  if (logoName) {
    try {
      const figlet = await import("figlet")
      const art = figlet.default.textSync(logoName.toUpperCase(), {
        font: "ANSI Shadow",
      })
      if (art) {
        writeFileSync("src/components/logo.txt", art)
        console.log("✅ ASCII Logo 已更新为:", logoName.toUpperCase())
      }
    } catch (e) {
      console.log("⚠️  Logo 生成失败:", e)
    }
  }

  // ==================== Step 10: 部署 Edge Function ====================
  console.log("\n正在设置密钥...")
  try {
    supabase(`secrets set LLM_API_KEY=${llmApiKey}`)
    supabase(`secrets set LLM_BASE_URL=${llmBaseUrl}`)
    supabase(`secrets set LLM_MODEL=${llmModel}`)
    supabase(`secrets set JINA_API_KEY=${jinaKey}`)
    console.log("✅ 密钥已设置")
  } catch {
    console.log("⚠️  密钥设置失败，请稍后手动执行")
  }

  console.log("\n正在部署 Edge Function...")
  try {
    supabaseInteractive("functions deploy chat")
    console.log("✅ Edge Function 已部署")
  } catch {
    console.log("⚠️  部署失败，请稍后手动执行:")
    console.log("     npx supabase functions deploy chat")
  }

  // ==================== Step 11: 完成 ====================
  console.log("\n📋 下一步:")
  console.log("  npm install && npm run dev")

  rl.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
