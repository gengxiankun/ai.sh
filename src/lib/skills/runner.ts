// Skill 脚本执行器 — 动态运行用户上传的 JS tool 脚本
// 通过 new Function() 沙箱执行，注入 args 和 context

// Skill 脚本完整定义（定义 + 可执行代码）
export type SkillScript = {
  definition: {
    type: 'function'
    function: {
      name: string
      description: string
      parameters?: Record<string, unknown>
    }
  }
  code: string
}

// 执行 skill 脚本
// 脚本必须导出 execute(args, context) 函数
export async function runSkillScript(
  script: SkillScript,
  args: string,
  context: { env: Record<string, string>; email?: string; userId?: string },
): Promise<string> {
  // new Function() 创建沙箱环境，注入脚本代码并调用 execute
  const fn = new Function(
    'args',
    'context',
    `${script.code}\nreturn execute(args, context)`,
  )
  const result = await fn(args, context)
  return String(result ?? '')
}
