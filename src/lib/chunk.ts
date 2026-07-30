// 递归文本分块 — 将长文档拆分为有重叠的语义片段
// 优先按段落边界分（\n\n），其次按句子边界分（。！？），最后按字符分

const CHUNK_SIZE = 1024
const CHUNK_OVERLAP = 128

export function splitContent(text: string): string[] {
  if (!text) return []

  const chunks: string[] = []

  // 按双换行分割段落
  const paragraphs = text.split(/\n\n+/)

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue

    if (trimmed.length <= CHUNK_SIZE) {
      // 短段落直接作为一个 chunk
      chunks.push(trimmed)
    } else {
      // 长段落按句子分割
      const sentences = splitSentences(trimmed)
      let current = ''
      for (const sentence of sentences) {
        if (current.length + sentence.length > CHUNK_SIZE && current.length > 0) {
          chunks.push(current.trim())
          // 重叠：保留上一个 chunk 的尾部
          current = current.slice(-CHUNK_OVERLAP) + sentence
        } else {
          current += (current ? ' ' : '') + sentence
        }
      }
      if (current.trim()) {
        chunks.push(current.trim())
      }
    }
  }

  return chunks.filter((c) => c.length > 0)
}

function splitSentences(text: string): string[] {
  // 按中文标点分句
  return text
    .split(/(?<=[。！？；\n])\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
}
