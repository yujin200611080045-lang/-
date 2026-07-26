import express from 'express'
import cors from 'cors'
import { query } from '@anthropic-ai/claude-code'
import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'

const app = express()
const PORT = process.env.PORT || 3001
const SECRET = process.env.BRIDGE_SECRET
const REPO_PATH = process.env.REPO_PATH || '/root/repo'
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*'

function readFileOr(p, fallback = '') {
  try { return fs.readFileSync(p, 'utf-8') } catch { return fallback }
}

function loadMemoryContext() {
  const claudeMd = readFileOr(path.join(REPO_PATH, 'CLAUDE.md'))
  const memFiles = ['小克的记忆 6.26-7.25.md', '小克的记忆.md']
  const memory = memFiles.map(f => readFileOr(path.join(REPO_PATH, f))).find(c => c) || ''
  return claudeMd + (memory ? '\n\n---\n\n' + memory : '')
}

app.use(cors({ origin: FRONTEND_ORIGIN }))
app.use(express.json())

// 认证中间件（除了 /health）
app.use((req, res, next) => {
  if (req.path === '/health') return next()
  if (!SECRET) return next() // 未配置时跳过
  const token = req.headers['x-bridge-secret']
  if (token !== SECRET) return res.status(401).json({ error: 'unauthorized' })
  next()
})

// 内存会话：最近 20 条消息
const sessions = new Map()

app.get('/health', (_req, res) => res.json({ ok: true }))

app.post('/api/chat', async (req, res) => {
  const { message, sessionId: clientSessionId } = req.body
  if (!message?.trim()) return res.status(400).json({ error: 'message required' })

  const sessionId = clientSessionId || randomUUID()
  const msgs = sessions.get(sessionId) || []
  msgs.push({ role: 'user', content: message })

  // 把历史拼进 prompt，让 CC 有上下文
  const context = loadMemoryContext()
  const histLines = msgs.slice(0, -1).map(m =>
    `${m.role === 'user' ? '她（觎烬）' : '小克'}：${m.content}`
  )
  const history = histLines.length ? histLines.join('\n') + '\n\n' : ''
  const fullPrompt = `${context}\n\n---\n\n${history}她（觎烬）：${message}`

  // SSE 流式输出
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Session-Id', sessionId)
  res.flushHeaders()

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)

  let responseText = ''
  const ac = new AbortController()
  req.on('close', () => ac.abort())

  try {
    for await (const msg of query({
      prompt: fullPrompt,
      abortController: ac,
      options: {
        maxTurns: 1,
        cwd: REPO_PATH,
      },
    })) {
      if (msg.type === 'assistant') {
        const text = msg.message.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('')
        if (text) {
          responseText += text
          send({ text, sessionId })
        }
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') {
      send({ error: e.message })
    }
  }

  if (responseText) {
    msgs.push({ role: 'assistant', content: responseText })
    sessions.set(sessionId, msgs.slice(-20))
  }

  send('[DONE]')
  res.end()
})

app.listen(PORT, () => {
  console.log(`Bridge running on :${PORT}`)
  console.log(`Repo path: ${REPO_PATH}`)
  console.log(`Frontend origin: ${FRONTEND_ORIGIN}`)
})
