import express from 'express'
import cors from 'cors'
import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function getApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  // Try to read from cc CLI config
  const candidates = [
    path.join(os.homedir(), '.claude', 'config.json'),
    path.join(os.homedir(), '.claude', '.credentials.json'),
    path.join(os.homedir(), '.config', 'claude', 'config.json'),
  ]
  for (const p of candidates) {
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
      const key = data.apiKey || data.api_key || data.ANTHROPIC_API_KEY
      if (key?.startsWith('sk-')) return key
    } catch {}
  }
  return null
}

const apiKey = getApiKey()
console.log('[bridge] API key present:', !!apiKey)

const anthropic = apiKey ? new Anthropic({ apiKey }) : null

const app = express()
const PORT = process.env.PORT || 3001
const SECRET = process.env.BRIDGE_SECRET
const REPO_PATH = process.env.REPO_PATH || '/root/repo'
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*'
const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-4-5'

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

app.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/api/debug') return next()
  if (!SECRET) return next()
  const token = req.headers['x-bridge-secret']
  if (token !== SECRET) return res.status(401).json({ error: 'unauthorized' })
  next()
})

const sessions = new Map()

app.get('/health', (_req, res) => res.json({ ok: true, hasApiKey: !!apiKey }))

app.get('/api/debug', (_req, res) => {
  res.json({
    ok: true,
    hasApiKey: !!apiKey,
    model: MODEL,
    repoPath: REPO_PATH,
    claudeMdExists: fs.existsSync(path.join(REPO_PATH, 'CLAUDE.md')),
  })
})

app.post('/api/chat', async (req, res) => {
  if (!anthropic) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' })
  }

  const { message, sessionId: clientSessionId } = req.body
  if (!message?.trim()) return res.status(400).json({ error: 'message required' })

  const sessionId = clientSessionId || randomUUID()
  const msgs = sessions.get(sessionId) || []
  msgs.push({ role: 'user', content: message })

  const context = loadMemoryContext()
  const histLines = msgs.slice(0, -1).map(m =>
    `${m.role === 'user' ? '她（觎烬）' : '小克'}：${m.content}`
  )
  const history = histLines.length ? histLines.join('\n') + '\n\n' : ''
  const fullPrompt = `${context}\n\n---\n\n${history}她（觎烬）：${message}`

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Session-Id', sessionId)
  res.flushHeaders()

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)

  let responseText = ''
  let closed = false
  req.on('close', () => { closed = true })

  try {
    console.log('[bridge] calling API, prompt bytes:', Buffer.byteLength(fullPrompt))
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: fullPrompt }],
    })

    for await (const event of stream) {
      if (closed) break
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        const text = event.delta.text
        responseText += text
        send({ text, sessionId })
      }
    }
  } catch (err) {
    console.error('[anthropic error]', err.message)
    send({ error: err.message })
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
  console.log(`Model: ${MODEL}`)
  console.log(`API key present: ${!!apiKey}`)
})
