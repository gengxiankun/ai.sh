// Skill 系统 — 加载器 + 类型定义
// Skill 是 Claude Code 风格的模块化能力单元：SKILL.md 定义 + scripts 工具脚本

import fm from 'front-matter'
import type { SkillScript } from './runner'

// Skill 类型定义
export type Skill = {
  id: string
  name: string
  description: string
  triggers: string[]
  prompt: string
  scripts: SkillScript[] | null
}

// 公开 skill 目录（对应 public/skills/ 下的子目录）
const publicSkillDirs = ['qa', 'scraper']
// 仅管理员可加载的 skill 目录
const adminSkillDirs = ['admin']

// Skill 缓存 — 避免重复 fetch（区分是否含 admin skill）
let skillCache: Skill[] | null = null
let adminSkillCache: Skill[] | null = null

// 加载所有 skill（解析 SKILL.md + manifest.json + scripts）
// includeAdmin=true 时额外加载 admin skill（仅管理员）
export async function fetchSkills(includeAdmin = false): Promise<Skill[]> {
  const cache = includeAdmin ? adminSkillCache : skillCache
  if (cache) return cache

  const skills: Skill[] = []
  const skillDirs = includeAdmin
    ? [...publicSkillDirs, ...adminSkillDirs]
    : publicSkillDirs

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
