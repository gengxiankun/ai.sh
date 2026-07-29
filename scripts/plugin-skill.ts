import * as p from "@clack/prompts"
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { execSync } from "node:child_process"
import fm from "front-matter"

const REGISTRY_URL = "https://raw.githubusercontent.com/gengxiankun/plugins.ai.sh/main"
const SKILLS_DIR = join(import.meta.dirname, "..", "public", "skills")
const REGISTRY_FILE = join(SKILLS_DIR, "registry.json")

type RegistryEntry = { version?: string; source?: string; admin?: boolean; icon?: string }
type LocalRegistry = { skills: Record<string, RegistryEntry> }

type RemoteSkill = {
  id: string
  name: string
  description: string
  icon?: string
  version: string
  author?: string
  admin?: boolean
}

type RemoteRegistry = {
  version: number
  skills: RemoteSkill[]
}

function readLocalRegistry(): LocalRegistry {
  try {
    return JSON.parse(readFileSync(REGISTRY_FILE, "utf-8"))
  } catch {
    return { skills: {} }
  }
}

function writeLocalRegistry(reg: LocalRegistry) {
  writeFileSync(REGISTRY_FILE, JSON.stringify(reg, null, 2))
}

// 简单 semver 比较：b > a 返回 true
function isNewer(installed: string, remote: string): boolean {
  const a = installed.split(".").map(Number)
  const b = remote.split(".").map(Number)
  for (let i = 0; i < 3; i++) {
    if ((b[i] || 0) > (a[i] || 0)) return true
    if ((b[i] || 0) < (a[i] || 0)) return false
  }
  return false
}

async function fetchRemoteRegistry(): Promise<RemoteRegistry> {
  const url = `${REGISTRY_URL}/index.json`
  p.log.info(`GET ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`获取注册表失败: HTTP ${res.status}`)
  return res.json()
}

async function downloadFile(url: string): Promise<string> {
  p.log.info(`GET ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`下载失败: HTTP ${res.status} - ${url}`)
  return res.text()
}

async function installSkill(skill: RemoteSkill) {
  const skillDir = join(SKILLS_DIR, skill.id)

  if (existsSync(skillDir) && existsSync(join(skillDir, "SKILL.md"))) {
    p.log.info(`${skill.id}: 已安装，跳过`)
    return
  }

  if (existsSync(skillDir)) {
    p.log.info(`${skill.id}: 删除旧目录 ${skillDir}`)
    rmSync(skillDir, { recursive: true, force: true })
  }

  p.log.info(`${skill.id}: 创建目录 ${skillDir}`)
  mkdirSync(skillDir, { recursive: true })
  mkdirSync(join(skillDir, "scripts"), { recursive: true })

  const base = `${REGISTRY_URL}/skills/${skill.id}`

  // 下载 SKILL.md
  p.log.info(`${skill.id}: 下载 SKILL.md`)
  const skillMd = await downloadFile(`${base}/SKILL.md`)
  writeFileSync(join(skillDir, "SKILL.md"), skillMd)

  // 下载 manifest.json + 脚本
  let files: string[] = []
  try {
    p.log.info(`${skill.id}: 下载 manifest.json`)
    const manifestText = await downloadFile(`${base}/scripts/manifest.json`)
    writeFileSync(join(skillDir, "scripts", "manifest.json"), manifestText)
    const m = JSON.parse(manifestText) as Record<string, { file: string } | string>
    files = Object.values(m).map((v) => (typeof v === "string" ? v : v.file))
    p.log.info(`${skill.id}: 发现 ${files.length} 个脚本文件`)
  } catch {
    p.log.info(`${skill.id}: 无 manifest.json`)
  }

  for (const f of files) {
    try {
      p.log.info(`${skill.id}: 下载 ${f}`)
      const code = await downloadFile(`${base}/scripts/${f}`)
      writeFileSync(join(skillDir, "scripts", f), code)
    } catch {
      p.log.warn(`${skill.id}: ${f} 下载失败，跳过`)
    }
  }

  p.log.info(`${skill.id}: 写入 registry.json`)
  const reg = readLocalRegistry()
  reg.skills[skill.id] = { icon: skill.icon, version: skill.version, source: base, admin: skill.admin }
  writeLocalRegistry(reg)
}

function uninstallSkill(skillId: string) {
  const skillDir = join(SKILLS_DIR, skillId)
  if (existsSync(skillDir)) {
    p.log.info(`${skillId}: 删除目录 ${skillDir}`)
    rmSync(skillDir, { recursive: true, force: true })
  }
  p.log.info(`${skillId}: 从 registry.json 移除`)
  const reg = readLocalRegistry()
  delete reg.skills[skillId]
  writeLocalRegistry(reg)
}

async function handleSecrets(skillId: string) {
  const skillMdPath = join(SKILLS_DIR, skillId, "SKILL.md")
  if (!existsSync(skillMdPath)) return

  let secrets: Record<string, string> = {}
  try {
    const text = readFileSync(skillMdPath, "utf-8")
    const { attributes } = fm<{ secrets?: Record<string, string> }>(text)
    secrets = attributes.secrets || {}
  } catch { return }

  if (Object.keys(secrets).length === 0) return

  p.note("该 skill 需要配置以下 API Key:", "Secrets")
  for (const [key, hint] of Object.entries(secrets)) {
    const val = await p.password({ message: `${key} (${hint})` })
    if (p.isCancel(val)) {
      p.log.warn(`跳过: ${key}`)
      continue
    }
    if (!val) continue

    const secretName = `SKILL_${skillId}_${key}`.toUpperCase().replace(/-/g, "_")
    const s = p.spinner()
    s.start(`设置 ${secretName}...`)
    try {
      execSync(`npx supabase secrets set ${secretName}="${val}"`, {
        stdio: ["inherit", "pipe", "pipe"],
        timeout: 30000,
      })
      s.stop(`${secretName} 已设置`)
    } catch {
      s.stop(`设置失败，稍后手动执行:\n  npx supabase secrets set ${secretName}="<your-key>"`)
    }
  }
}

async function main() {
  p.intro("ai.sh — Skill 插件管理")

  // 拉取远程注册表 + 本地已安装列表
  const ss = p.spinner()
  ss.start("获取插件列表...")
  let remote: RemoteRegistry
  try {
    remote = await fetchRemoteRegistry()
  } catch (e) {
    ss.stop("获取失败")
    p.cancel(String(e))
    return
  }
  const local = readLocalRegistry()
  const localKeys = Object.keys(local.skills)
  p.log.info(`本地已安装: ${localKeys.length > 0 ? localKeys.join(", ") : "(无)"}`)
  const hasUpdates = remote.skills.some((s) => {
    const lv = local.skills[s.id]?.version
    return lv && isNewer(lv, s.version)
  })
  ss.stop(`${remote.skills.length} 个可用，${localKeys.length} 个已安装${hasUpdates ? "（有更新可用）" : ""}`)

  if (remote.skills.length === 0) {
    p.note("注册表中暂无可用 skill。", "提示")
    return
  }

  // 多选界面 — 已安装的默认选中
  const installed = new Set(localKeys)
  const selected = await p.multiselect({
    message: "选择要启用的 skill（空格勾选/取消，回车确认）",
    initialValues: [...installed],
    options: remote.skills.map((s) => {
      const isInstalled = installed.has(s.id)
      const lv = local.skills[s.id]?.version
      const newer = lv && isNewer(lv, s.version)

      let tag = ""
      if (isInstalled && s.admin) tag = " [已安装·管理员]"
      else if (isInstalled) tag = newer ? ` [更新 v${lv} → v${s.version}]` : " [已安装]"
      else if (s.admin) tag = " [管理员]"

      const hint = isInstalled
        ? `${s.description} · v${lv ?? s.version}${newer ? " → v" + s.version : ""}`
        : `${s.description} · v${s.version}`

      return { value: s.id, label: `${s.name}${tag}`, hint }
    }),
  })
  if (p.isCancel(selected)) return

  const selectedSet = new Set(selected as string[])
  const toInstall: RemoteSkill[] = []
  const toUpdate: RemoteSkill[] = []
  const toUninstall: string[] = []

  for (const s of remote.skills) {
    const was = installed.has(s.id)
    const now = selectedSet.has(s.id)
    if (!was && now) {
      toInstall.push(s)
    } else if (was && now && isNewer(local.skills[s.id]?.version ?? "0", s.version)) {
      toUpdate.push(s)
    } else if (was && !now) {
      toUninstall.push(s.id)
    }
  }

  if (toInstall.length === 0 && toUpdate.length === 0 && toUninstall.length === 0) {
    p.note("没有需要更新的 skill。", "提示")
    p.outro("完成")
    return
  }

  // 显示操作摘要
  const lines: string[] = []
  for (const s of toInstall) lines.push(`  + ${s.name} (${s.id}) v${s.version}`)
  for (const s of toUpdate) lines.push(`  ↑ ${s.name} (${s.id}) ${local.skills[s.id]?.version} → ${s.version}`)
  for (const id of toUninstall) lines.push(`  - ${id}`)
  p.note(
    lines.join("\n"),
    `即将执行 ${toInstall.length} 个安装 + ${toUpdate.length} 个更新 + ${toUninstall.length} 个卸载`,
  )

  const confirm = await p.confirm({ message: "确认执行？" })
  if (!confirm) {
    p.cancel("已取消")
    return
  }

  // 批量卸载
  for (const id of toUninstall) {
    uninstallSkill(id)
    p.log.success(`卸载: ${id}`)
  }

  // 批量安装
  for (const s of toInstall) {
    try {
      await installSkill(s)
      p.log.success(`安装: ${s.name} v${s.version}`)
      await handleSecrets(s.id)
    } catch (e) {
      p.log.error(`安装失败: ${s.name} — ${e}`)
    }
  }

  // 批量更新（先卸载再安装）
  for (const s of toUpdate) {
    const oldVer = local.skills[s.id]?.version ?? "?"
    try {
      uninstallSkill(s.id)
      await installSkill(s)
      p.log.success(`更新: ${s.name} ${oldVer} → ${s.version}`)
      await handleSecrets(s.id)
    } catch (e) {
      p.log.error(`更新失败: ${s.name} — ${e}`)
    }
  }

  p.outro("完成")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
