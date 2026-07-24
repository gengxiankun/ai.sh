// 内置命令工具 — 供 AI Agent tool calling 使用
// 仅保留无对应 skill 脚本的兜底工具

// 暴露给 AI Agent 的 tool 定义（OpenAI function calling 格式）
export const TOOLS: {
  type: 'function'
  function: { name: string; description: string; parameters?: Record<string, unknown> }
}[] = []

// 执行 AI Agent 的 tool 调用（兜底 — 优先由 skill 脚本处理）
export async function runTool(
  name: string,
  _args: string = '{}',
  _context?: { email?: string },
): Promise<string> {
  return `Unknown tool: ${name}`
}
