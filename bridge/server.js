import express from 'express'
import cors from 'cors'
import { spawn, execFile, execSync } from 'child_process'
import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function findClaudeBin() {
  const candidates = [
    '/root/.npm/_npx/97540b0888a2deac/node_modules/@anthropic-ai/claude-code-linux-x64/claude',
    path.join(__dirname, 'node_modules/@anthropic-ai/claude-code-linux-x64/claude'),
    path.join(__dirname, 'node_modules/@anthropic-ai/claude-code-linux-x64-musl/claude'),
    path.join(__dirname, 'node_modules/.bin/claude'),
  ]
  const found = candidates.find(p => fs.existsSync(p))
  if (found) return found
  try {
    const discovered = execSync('find /root/.npm -name claude -type f 2>/dev/null | head -1', { encoding: 'utf8' }).trim()
    if (discovered) return discovered
  } catch {}
  return 'claude'
}

const CLAUDE_BIN = findClaudeBin()

console.log('CLAUDE_BIN:', CLAUDE_BIN)

const app = express()
const PORT = process.env.PORT || 3001
const SECRET = process.env.BRIDGE_SECRET
const REPO_PATH = process.env.REPO_PATH || '/root/repo'
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*'

function claudeEnv() {
  const env = { ...process.env }
  delete env.ANTHROPIC_API_KEY
  return env
}

function readFileOr(p, fallback = '') {
  try { return fs.readFileSync(p, 'utf-8') } catch { return fallback }
}

function loadMemoryContext() {
  return readFileOr(path.join(REPO_PATH, 'CLAUDE.md'))
}

app.use(cors({ origin: FRONTEND_ORIGIN }))
app.use(express.json())

app.use((req, res, next) => {
  const open = ['/health', '/api/debug', '/api/test-cc']
  if (open.includes(req.path)) return next()
  if (!SECRET) return next()
  const token = req.headers['x-bridge-secret']
  if (token !== SECRET) return res.status(401).json({ error: 'unauthorized' })
  next()
})

const OMBRE_URL = process.env.OMBRE_URL || 'http://localhost:18001'
const OMBRE_HOOK_TOKEN = process.env.OMBRE_HOOK_TOKEN || 'ombre2026'
const OMBRE_MCP_TOKEN = process.env.OMBRE_MCP_TOKEN || 'ombre2026'

async function queryOmbre(query) {
  try {
    const url = `${OMBRE_URL}/breath-hook?query=${encodeURIComponent(query)}&max_results=5`
    const res = await fetch(url, {
      headers: { 'X-Ombre-Hook-Token': OMBRE_HOOK_TOKEN },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) { console.log('[ombre] breath-hook', res.status); return '' }
    const text = await res.text()
    console.log('[ombre] got', text.length, 'bytes from breath-hook')
    return text
  } catch (err) { console.error('[ombre] breath-hook error:', err.message); return '' }
}

async function holdToOmbre(content) {
  try {
    const res = await fetch(`${OMBRE_URL}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OMBRE_MCP_TOKEN}` },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'hold', arguments: { content } }, id: Date.now() }),
      signal: AbortSignal.timeout(10000),
    })
    const text = await res.text()
    console.log('[ombre hold]', res.status, text.slice(0, 150))
  } catch (err) { console.error('[ombre hold error]', err.message) }
}

const sessions = new Map()

app.get('/health', (_req, res) => res.json({ ok: true, bin: CLAUDE_BIN }))

// No-auth test: run CC with a simple prompt, return raw output
app.get('/api/test-cc', (req, res) => {
  console.log('[test-cc] running cc subprocess...')
  execFile(CLAUDE_BIN, ['-p', 'say hi in one sentence'], {
    cwd: REPO_PATH,
    env: claudeEnv(),
    timeout: 30000,
    maxBuffer: 2 * 1024 * 1024,
  }, (err, stdout, stderr) => {
    console.log('[test-cc] exit:', err?.code, 'stdout bytes:', stdout?.length, 'stderr bytes:', stderr?.length)
    console.log('[test-cc] stderr:', stderr?.slice(0, 300))
    res.json({
      bin: CLAUDE_BIN,
      exitCode: err?.code ?? 0,
      error: err ? err.message : null,
      stdout: stdout,
      stderr: stderr?.slice(0, 500),
    })
  })
})

app.get('/api/debug', (_req, res) => {
  res.json({ ok: true, bin: CLAUDE_BIN, repoPath: REPO_PATH, claudeMdExists: fs.existsSync(path.join(REPO_PATH, 'CLAUDE.md')) })
})

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
  const ombreMemory = await queryOmbre(message)
  const ombreSection = ombreMemory ? `\n\n---\n\n## 记忆库相关片段\n${ombreMemory}\n` : ''
  const fullPrompt = `${context}${ombreSection}\n\n---\n\n${history}她（觎烬）：${message}`

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Session-Id', sessionId)
  res.flushHeaders()

  const send = (obj) => { try { res.write(`data: ${JSON.stringify(obj)}\n\n`) } catch {} }

  console.log('[chat] spawning cc, prompt bytes:', Buffer.byteLength(fullPrompt))

  const claudeProc = spawn(CLAUDE_BIN, ['-p', fullPrompt, '--model', 'claude-sonnet-4-6'], {
    cwd: REPO_PATH,
    env: claudeEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let responseText = ''
  let reqClosed = false

  // keep-alive ping every 8s so mobile browsers don't time out
  const keepAlive = setInterval(() => { try { res.write(': ping\n\n') } catch {} }, 8000)

  req.on('close', () => { reqClosed = true })

  claudeProc.stdout.on('data', chunk => {
    const text = chunk.toString()
    console.log('[cc stdout]', JSON.stringify(text.slice(0, 60)))
    responseText += text
    send({ text, sessionId })
  })

  claudeProc.stderr.on('data', data => {
    console.error('[cc stderr]', data.toString().slice(0, 300))
  })

  claudeProc.on('close', (code, signal) => {
    clearInterval(keepAlive)
    console.log('[cc exit]', code, signal, 'response bytes:', responseText.length)
    if (responseText) {
      msgs.push({ role: 'assistant', content: responseText })
      sessions.set(sessionId, msgs.slice(-20))
      holdToOmbre(`觎烬：${message}\n小克：${responseText}`).catch(() => {})
    }
    send('[DONE]')
    res.end()
  })

  claudeProc.on('error', err => {
    clearInterval(keepAlive)
    console.error('[cc spawn error]', err.message)
    send({ error: err.message })
    res.end()
  })
})

app.listen(PORT, () => {
  console.log(`Bridge running on :${PORT}`)
  console.log(`CLAUDE_BIN: ${CLAUDE_BIN}`)
  console.log(`Repo: ${REPO_PATH}`)
})
