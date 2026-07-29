// Skill 系统 — 加载器 + 类型定义
// Skill 是 Claude Code 风格的模块化能力单元：SKILL.md 定义 + scripts 工具脚本
// 所有 skill（内置 + 插件）统一从 public/skills/registry.json 加载

import fm from 'front-matter'
import type { SkillScript } from './runner'

// Skill 类型定义
export type Skill = {
  id: string
  name: string
  description: string
  icon: string
  triggers: string[]
  prompt: string
  scripts: SkillScript[] | null
}

// Skill 缓存 — 避免重复 fetch（区分是否含 admin skill）
let skillCache: Skill[] | null = null
let adminSkillCache: Skill[] | null = null

type RegistryEntry = { version?: string; admin?: boolean; icon?: string }
type LocalRegistry = { skills: Record<string, RegistryEntry> }

// 读取本地插件注册表，获取已安装的 skill 列表
// includeAdmin=false 时过滤掉 admin:true 的 skill
async function getInstalledSkillDirs(includeAdmin: boolean): Promise<string[]> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}skills/registry.json`)
    if (!res.ok) return []
    const data = (await res.json()) as LocalRegistry
    return Object.entries(data.skills || {})
      .filter(([, entry]) => includeAdmin || !entry.admin)
      .map(([id]) => id)
  } catch {
    return []
  }
}

// 加载所有 skill（解析 SKILL.md + manifest.json + scripts）
// includeAdmin=true 时额外加载 admin 标记的 skill（仅管理员）
export async function fetchSkills(includeAdmin = false): Promise<Skill[]> {
  const cache = includeAdmin ? adminSkillCache : skillCache
  if (cache) return cache

  // 读取注册表获取 icon 映射
  const iconMap: Record<string, string> = {}
  try {
    const regRes = await fetch(`${import.meta.env.BASE_URL}skills/registry.json`)
    if (regRes.ok) {
      const reg = (await regRes.json()) as LocalRegistry
      for (const [id, entry] of Object.entries(reg.skills || {})) {
        if (entry.icon) iconMap[id] = entry.icon
      }
    }
  } catch { /* 注册表不存在时 icon 为空 */ }

  const skills: Skill[] = []
  const skillDirs = await getInstalledSkillDirs(includeAdmin)

  for (const dir of skillDirs) {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}skills/${dir}/SKILL.md`)
      if (!res.ok) continue
      const text = await res.text()
      const { attributes, body } = fm<{
        name: string
        description: string
        triggers: string
      }>(text)

      let scripts: SkillScript[] | null = null
      try {
        const mRes = await fetch(`${import.meta.env.BASE_URL}skills/${dir}/scripts/manifest.json`)
        console.log(
          `[skills] manifest fetch ${dir}: ok=${mRes.ok} status=${mRes.status}`,
        )
        if (mRes.ok) {
          const manifest = (await mRes.json()) as Record<
            string,
            { file: string; description?: string } | string
          >
          console.log(
            `[skills] manifest ${dir}: ${Object.keys(manifest).length} entries`,
          )
          const entries: SkillScript[] = []
          for (const [name, entry] of Object.entries(manifest)) {
            const info =
              typeof entry === 'string'
                ? { file: entry }
                : (entry as {
                    file: string
                    description?: string
                    params?: Record<string, string>
                  })
            const sRes = await fetch(`${import.meta.env.BASE_URL}skills/${dir}/scripts/${info.file}`)
            if (sRes.ok) {
              const code = await sRes.text()
              const def: SkillScript['definition'] = {
                type: 'function' as const,
                function: {
                  name,
                  description: info.description ?? `${name} tool`,
                },
              }
              // 从 manifest 的 params 字段构建 OpenAPI parameters schema
              if (info.params) {
                const properties: Record<
                  string,
                  { type: string; description: string }
                > = {}
                for (const [k, v] of Object.entries(info.params)) {
                  properties[k] = { type: 'string', description: v }
                }
                ;(def.function as Record<string, unknown>).parameters = {
                  type: 'object',
                  properties,
                  required: Object.keys(info.params),
                }
              }
              entries.push({ definition: def, code })
            }
          }
          if (entries.length) scripts = entries
        }
      } catch (e) {
        console.warn(`[skills] scripts parse failed for ${dir}:`, e)
      }

      skills.push({
        id: dir,
        name: attributes.name || dir,
        description: attributes.description || '',
        icon: iconMap[dir] || '',
        triggers: attributes.triggers
          ?.split(',')
          .map((s) => s.trim()) ?? [],
        prompt: body.trim(),
        scripts,
      })
    } catch {
      // 单个 skill 加载失败，继续加载下一个
      continue
    }
  }

  if (includeAdmin) adminSkillCache = skills
  else skillCache = skills
  return skills
}

// 根据用户输入文本匹配最合适的 skill（基于 triggers 关键字）
export function matchSkillTrigger(
  text: string,
  skills: Skill[],
): Skill | null {
  const lower = text.toLowerCase()
  for (const skill of skills) {
    for (const t of skill.triggers) {
      if (lower.includes(t.toLowerCase())) return skill
    }
  }
  return null
}
