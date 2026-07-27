import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const OMBRE_URL = process.env.OMBRE_URL || 'http://localhost:18001'
const OMBRE_MCP_TOKEN = process.env.OMBRE_MCP_TOKEN || 'ombre2026'
const REPO_PATH = process.env.REPO_PATH || '/root/repo'

async function holdChunk(content) {
  const res = await fetch(`${OMBRE_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OMBRE_MCP_TOKEN}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'grow', arguments: { content } },
      id: Date.now(),
    }),
    signal: AbortSignal.timeout(15000),
  })
  const text = await res.text()
  return { status: res.status, body: text.slice(0, 100) }
}

function splitIntoChunks(markdown) {
  const chunks = []
  const lines = markdown.split('\n')
  let currentSection = ''
  let currentTitle = ''

  for (const line of lines) {
    if (line.startsWith('### ') || line.startsWith('#### ')) {
      if (currentSection.trim().length > 50) {
        chunks.push({ title: currentTitle, content: currentSection.trim() })
      }
      currentTitle = line.replace(/^#+\s*/, '')
      currentSection = line + '\n'
    } else {
      currentSection += line + '\n'
      // 如果单个 section 太长就在表格行之间分割
      if (currentSection.length > 3000 && line.startsWith('|')) {
        chunks.push({ title: currentTitle, content: currentSection.trim() })
        currentSection = `### ${currentTitle} (续)\n`
      }
    }
  }
  if (currentSection.trim().length > 50) {
    chunks.push({ title: currentTitle, content: currentSection.trim() })
  }
  return chunks
}

async function main() {
  // 读整合版记忆文档
  const memoryFile = path.join(REPO_PATH, '小克的记忆.md')
  if (!fs.existsSync(memoryFile)) {
    console.error('找不到文件：', memoryFile)
    process.exit(1)
  }

  const content = fs.readFileSync(memoryFile, 'utf-8')
  const chunks = splitIntoChunks(content)

  console.log(`共拆出 ${chunks.length} 个片段，开始导入 Ombre Brain...\n`)

  let ok = 0
  let fail = 0

  for (let i = 0; i < chunks.length; i++) {
    const { title, content: text } = chunks[i]
    try {
      const result = await holdChunk(text)
      if (result.status === 200) {
        console.log(`[${i + 1}/${chunks.length}] ✅ ${title}`)
        ok++
      } else {
        console.log(`[${i + 1}/${chunks.length}] ❌ ${title} — HTTP ${result.status}: ${result.body}`)
        fail++
      }
    } catch (err) {
      console.log(`[${i + 1}/${chunks.length}] ❌ ${title} — ${err.message}`)
      fail++
    }
    // 避免打太快
    await new Promise(r => setTimeout(r, 200))
  }

  console.log(`\n导入完成：成功 ${ok}，失败 ${fail}`)
}

main()
