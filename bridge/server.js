import express from 'express'
import cors from 'cors'
import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLAUDE_BIN = [
  path.join(__dirname, 'node_modules/@anthropic-ai/claude-code-linux-x64/claude'),
  path.join(__dirname, 'node_modules/@anthropic-ai/claude-code-linux-x64-musl/claude'),
  path.join(__dirname, 'node_modules/.bin/claude'),
].find(p => fs.existsSync(p)) || 'claude'

console.log('CLAUDE_BIN:', CLAUDE_BIN)

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

app.use((req, res, next) => {
  if (req.path === '/health') return next()
  if (!SECRET) return next()
  const token = req.headers['x-bridge-secret']
  if (token !== SECRET) return res.status(401).json({ error: 'unauthorized' })
  next()
})

const sessions = new Map()

app.get('/health', (_req, res) => res.json({ ok: true }))

app.post('/api/chat', async (req, res) => {
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

  console.log('[bridge] spawning claude, prompt length:', fullPrompt.length)

  const claudeProc = spawn(CLAUDE_BIN, ['--print'], {
    cwd: REPO_PATH,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  claudeProc.stdin.write(fullPrompt, 'utf8')
  claudeProc.stdin.end()

  let responseText = ''

  req.on('close', () => claudeProc.kill())

  claudeProc.stdout.on('data', chunk => {
    const text = chunk.toString()
    responseText += text
    send({ text, sessionId })
  })

  claudeProc.stderr.on('data', data => {
    console.error('[claude stderr]', data.toString().slice(0, 300))
  })

  claudeProc.on('close', (code) => {
    console.log('[claude exit]', code, 'response length:', responseText.length)
    if (responseText) {
      msgs.push({ role: 'assistant', content: responseText })
      sessions.set(sessionId, msgs.slice(-20))
    }
    send('[DONE]')
    res.end()
  })

  claudeProc.on('error', (err) => {
    console.error('[claude spawn error]', err.message)
    send({ error: err.message })
    res.end()
  })
})

app.listen(PORT, () => {
  console.log(`Bridge running on :${PORT}`)
  console.log(`Repo path: ${REPO_PATH}`)
  console.log(`CLAUDE_BIN: ${CLAUDE_BIN}`)
})
