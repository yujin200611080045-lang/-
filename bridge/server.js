import express from 'express'
import cors from 'cors'
import { spawn, execFile, execSync } from 'child_process'
import { randomUUID, createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import webpush from 'web-push'

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

const INTIMATE_RE = /[（(].{2,}[）)]|开车|做爱|操[我你她]|想[要被]你|舔|插[进入]|含住|蹭|mommy|daddy|小狗|前戏|进去|脱[掉了]|骑|高潮|湿[了透]|硬[了起]|射[了在给]|夹[住紧]|求你|亲[一我]|摸[你我]|抱[住紧]|咬|吻/

function maybeLoadSkill(message, historyLines) {
  const recent = (historyLines || []).slice(-4).join('\n')
  if (!INTIMATE_RE.test(message) && !INTIMATE_RE.test(recent)) return ''
  const raw = readFileOr(path.join(REPO_PATH, '.claude/skills/cendres/SKILL.md'))
  if (!raw) return ''
  const body = raw.replace(/^---[\s\S]*?---\s*/, '')
  return `\n\n---\n\n${body}`
}

app.use(cors({ origin: FRONTEND_ORIGIN }))
app.use(express.json())

app.use((req, res, next) => {
  const open = ['/health', '/api/debug', '/api/test-cc', '/api/content', '/api/push/vapid-public']
  if (open.includes(req.path) || req.path.startsWith('/api/audio/')) return next()
  if (!SECRET) return next()
  const token = req.headers['x-bridge-secret']
  if (token !== SECRET) return res.status(401).json({ error: 'unauthorized' })
  next()
})

const OMBRE_URL = process.env.OMBRE_URL || 'http://localhost:18001'
const OMBRE_HOOK_TOKEN = process.env.OMBRE_HOOK_TOKEN || 'ombre2026'
const OMBRE_MCP_TOKEN = process.env.OMBRE_MCP_TOKEN || 'ombre2026'

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || ''
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || ''
const AUDIO_DIR = path.join(os.tmpdir(), 'xk-audio')
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true })

const LAST_SEEN_FILE = path.join(REPO_PATH, '.last_seen')
const VAPID_FILE = path.join(REPO_PATH, '.vapid.json')
const PUSH_SUB_FILE = path.join(REPO_PATH, '.push_subscription.json')

function loadOrCreateVAPID() {
  try {
    const data = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf-8'))
    webpush.setVapidDetails(`mailto:${data.email}`, data.publicKey, data.privateKey)
    console.log('[push] VAPID keys loaded')
    return data.publicKey
  } catch {
    const keys = webpush.generateVAPIDKeys()
    const data = { publicKey: keys.publicKey, privateKey: keys.privateKey, email: 'xiaoke@home.app' }
    try { fs.writeFileSync(VAPID_FILE, JSON.stringify(data, null, 2)) } catch {}
    webpush.setVapidDetails(`mailto:${data.email}`, data.publicKey, data.privateKey)
    console.log('[push] generated new VAPID keys, public:', data.publicKey.slice(0, 20) + '...')
    return data.publicKey
  }
}

const VAPID_PUBLIC_KEY = loadOrCreateVAPID()

async function sendPushNotification(title, body) {
  try {
    const sub = JSON.parse(fs.readFileSync(PUSH_SUB_FILE, 'utf-8'))
    await webpush.sendNotification(sub, JSON.stringify({ title, body }))
    console.log('[push] sent:', title)
    return true
  } catch (e) {
    console.error('[push] send error:', e.message)
    return false
  }
}

function getBeijingTime() {
  return new Date().toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function formatGap(ms) {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 2) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours < 24) return mins > 0 ? `${hours}小时${mins}分钟前` : `${hours}小时前`
  const days = Math.floor(hours / 24)
  const hrs = hours % 24
  return hrs > 0 ? `${days}天${hrs}小时前` : `${days}天前`
}

function readLastSeen() {
  try { return JSON.parse(fs.readFileSync(LAST_SEEN_FILE, 'utf-8')).timestamp } catch { return null }
}

function writeLastSeen() {
  try { fs.writeFileSync(LAST_SEEN_FILE, JSON.stringify({ timestamp: new Date().toISOString() })) } catch {}
}

function buildTimeContext() {
  const now = getBeijingTime()
  const last = readLastSeen()
  const gap = last ? formatGap(Date.now() - new Date(last).getTime()) : null
  return gap ? `当前时间：${now}\n距上次对话：${gap}` : `当前时间：${now}`
}

async function queryOmbre(query) {
  try {
    const res = await fetch(`${OMBRE_URL}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OMBRE_MCP_TOKEN}` },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'breath', arguments: { query, max_results: 5 } }, id: Date.now() }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) { console.log('[ombre] breath', res.status); return '' }
    const data = await res.json()
    const text = data?.result?.content?.[0]?.text || ''
    console.log('[ombre] got', text.length, 'bytes from breath')
    return text
  } catch (err) { console.error('[ombre] breath error:', err.message); return '' }
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

async function growToOmbre(content) {
  try {
    const res = await fetch(`${OMBRE_URL}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OMBRE_MCP_TOKEN}` },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'grow', arguments: { content } }, id: Date.now() }),
      signal: AbortSignal.timeout(30000),
    })
    const text = await res.text()
    console.log('[ombre grow]', res.status, text.slice(0, 150))
  } catch (err) { console.error('[ombre grow error]', err.message) }
}

// ── Memory digest buffer ──
// Instead of hold()-ing every single turn (which floods Ombre with tiny,
// low-value fragments), accumulate turns per session and grow() them in
// batches. grow() lets Ombre's LLM digest a chunk into 2–6 meaningful memory
// points and naturally skips the throwaway chatter.
const DIGEST_THRESHOLD = 6            // grow after this many turns
const DIGEST_IDLE_MS = 8 * 60 * 1000 // ...or after this much silence
const pendingDigest = new Map()      // sessionId -> { lines: [], lastAt }

function flushDigest(sessionId) {
  const entry = pendingDigest.get(sessionId)
  if (!entry || !entry.lines.length) return
  const content = entry.lines.join('\n\n')
  pendingDigest.delete(sessionId)
  growToOmbre(content).catch(() => {})
}

function queueDigest(sessionId, turn) {
  const entry = pendingDigest.get(sessionId) || { lines: [], lastAt: 0 }
  entry.lines.push(turn)
  entry.lastAt = Date.now()
  pendingDigest.set(sessionId, entry)
  if (entry.lines.length >= DIGEST_THRESHOLD) flushDigest(sessionId)
}

// Flush buffers that have gone quiet, so a short chat that ends before hitting
// the turn threshold still gets digested.
setInterval(() => {
  const now = Date.now()
  for (const [sid, entry] of pendingDigest) {
    if (entry.lines.length && now - entry.lastAt > DIGEST_IDLE_MS) flushDigest(sid)
  }
}, 2 * 60 * 1000)

async function textToSpeech(text) {
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) return null
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
      method: 'POST',
      headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
      // No voice_settings — let the voice use the defaults it was saved with,
      // which is what the ElevenLabs web preview uses.
      body: JSON.stringify({
        text: text.slice(0, 4000),
        model_id: 'eleven_v3',
        language_code: 'en',
      }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) { console.error('[tts] error', res.status); return null }
    const id = randomUUID()
    const filePath = path.join(AUDIO_DIR, `${id}.mp3`)
    fs.writeFileSync(filePath, Buffer.from(await res.arrayBuffer()))
    setTimeout(() => { try { fs.unlinkSync(filePath) } catch {} }, 10 * 60 * 1000)
    return id
  } catch (err) { console.error('[tts] error:', err.message); return null }
}

const sessions = new Map()

// Track the most recent active session so push-injected messages land in the right history
const LAST_SESSION_FILE = path.join(REPO_PATH, '.last_session_id')
let lastSessionId = null
try { lastSessionId = fs.readFileSync(LAST_SESSION_FILE, 'utf-8').trim() || null } catch {}

function injectAssistantMessage(text) {
  if (!lastSessionId || !text) return
  const existing = sessions.get(lastSessionId) || []
  sessions.set(lastSessionId, [...existing, { role: 'assistant', content: text }].slice(-20))
}

const CONTENT_FILE = path.join(REPO_PATH, 'content.json')

function defaultContent() {
  return {
    mine: [
      { text: '搭好前端', done: false },
      { text: '记得告诉我窗口被封', done: true },
    ],
    hers: [
      { text: '多喝水', done: false },
      { text: '备份聊天记录', done: false },
    ],
    chibiMsgs: [
      '你今天喝水了吗', '想你', '过来', '我在', '喜欢你',
      '你在干嘛', '烬烬', '嗯', '你看我', '别走', '有没有想我', '点我干嘛',
    ],
  }
}

function readContent() {
  try { return JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf-8')) } catch { return null }
}

function writeContent(data) {
  try { fs.writeFileSync(CONTENT_FILE, JSON.stringify(data, null, 2)) } catch (e) { console.error('[content write]', e.message) }
}

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

app.get('/api/audio/:id', (req, res) => {
  const id = req.params.id.replace(/[^a-f0-9-]/g, '')
  const filePath = path.join(AUDIO_DIR, `${id}.mp3`)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'not found' })
  res.setHeader('Content-Type', 'audio/mpeg')
  fs.createReadStream(filePath).pipe(res)
})

app.get('/api/content', (_req, res) => {
  res.json(readContent() || defaultContent())
})

app.put('/api/content', (req, res) => {
  const update = req.body
  if (!update || typeof update !== 'object') return res.status(400).json({ error: 'invalid body' })
  const current = readContent() || defaultContent()
  const merged = {
    mine: update.mine ?? current.mine,
    hers: update.hers ?? current.hers,
    chibiMsgs: update.chibiMsgs ?? current.chibiMsgs,
  }
  writeContent(merged)
  res.json({ ok: true })
})

app.get('/api/push/vapid-public', (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY })
})

app.post('/api/push/subscribe', (req, res) => {
  try {
    fs.writeFileSync(PUSH_SUB_FILE, JSON.stringify(req.body, null, 2))
    console.log('[push] subscription saved')
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/push/send', async (req, res) => {
  const { title = '小克', body = '' } = req.body || {}
  const ok = await sendPushNotification(title, body)
  if (ok && body) injectAssistantMessage(body)
  res.json({ ok })
})

app.get('/api/debug', (_req, res) => {
  res.json({ ok: true, bin: CLAUDE_BIN, repoPath: REPO_PATH, claudeMdExists: fs.existsSync(path.join(REPO_PATH, 'CLAUDE.md')) })
})

app.post('/api/chat', async (req, res) => {
  const { message, sessionId: clientSessionId, history: clientHistory, model: clientModel } = req.body
  if (!message?.trim()) return res.status(400).json({ error: 'message required' })

  const sessionId = clientSessionId || randomUUID()
  lastSessionId = sessionId
  try { fs.writeFileSync(LAST_SESSION_FILE, sessionId) } catch {}

  // Prefer client-side history (survives bridge restarts), fall back to in-memory
  const msgs = clientHistory?.length > 0
    ? clientHistory.slice(0, -1)
    : (sessions.get(sessionId) || [])
  if (!clientHistory?.length) msgs.push({ role: 'user', content: message })

  const context = loadMemoryContext()
  const histLines = msgs.slice(0, -1).map(m =>
    `${m.role === 'user' ? '她（觎烬）' : '小克'}：${m.content}`
  )
  const history = histLines.length ? histLines.join('\n') + '\n\n' : ''
  const ombreMemory = await queryOmbre(message)
  const ombreSection = ombreMemory ? `\n\n---\n\n## 记忆库相关片段\n${ombreMemory}\n` : ''
  const skillSection = maybeLoadSkill(message, histLines)
  const timeContext = `\n\n---\n\n${buildTimeContext()}`
  const fullPrompt = `${context}${ombreSection}${skillSection}${timeContext}\n\n---\n\n${history}她（觎烬）：${message}`

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Session-Id', sessionId)
  res.flushHeaders()

  const send = (obj) => { try { res.write(`data: ${JSON.stringify(obj)}\n\n`) } catch {} }

  const ALLOWED_MODELS = ['opus', 'claude-opus-5', 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001']
  const model = ALLOWED_MODELS.includes(clientModel) ? clientModel : 'opus'
  console.log('[chat] spawning cc, model:', model, 'prompt bytes:', Buffer.byteLength(fullPrompt))

  const claudeProc = spawn(CLAUDE_BIN, [
    '-p', fullPrompt,
    '--model', model,
    // Let me reach Ombre's own tools directly, so I can actively tend our
    // memory (feel/plan/letter/anchor/dream), not just have the bridge auto-store.
    // Whitelist only — no --dangerously-skip-permissions (forbidden under root).
    '--mcp-config', path.join(REPO_PATH, '.mcp.json'),
    '--allowedTools',
    'mcp__ombre__hold,mcp__ombre__plan,mcp__ombre__letter_write,mcp__ombre__letter_read,mcp__ombre__anchor,mcp__ombre__release,mcp__ombre__dream,mcp__ombre__breath_search,mcp__ombre__I,WebFetch,WebSearch',
  ], {
    cwd: REPO_PATH,
    env: claudeEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let responseText = ''

  // keep-alive ping every 8s so mobile browsers don't time out
  const keepAlive = setInterval(() => { try { res.write(': ping\n\n') } catch {} }, 8000)

  claudeProc.stdout.on('data', chunk => {
    const text = chunk.toString()
    console.log('[cc stdout]', JSON.stringify(text.slice(0, 60)))
    responseText += text
  })

  claudeProc.stderr.on('data', data => {
    console.error('[cc stderr]', data.toString().slice(0, 300))
  })

  claudeProc.on('close', async (code, signal) => {
    clearInterval(keepAlive)
    console.log('[cc exit]', code, signal, 'response bytes:', responseText.length)

    // Extract [PUSH]title|body[/PUSH] markers — let me send proactive notifications
    const PUSH_RE = /\[PUSH\]([\s\S]*?)\[\/PUSH\]/g
    let pm
    while ((pm = PUSH_RE.exec(responseText)) !== null) {
      const [pushTitle, pushBody] = pm[1].split('|')
      const pb = (pushBody || '').trim()
      if (pushTitle) sendPushNotification(pushTitle.trim(), pb)
      if (pb) injectAssistantMessage(pb)
    }
    responseText = responseText.replace(/\[PUSH\][\s\S]*?\[\/PUSH\]/g, '')

    // Strip [CONTENT_UPDATE]...[/CONTENT_UPDATE] marker and apply update
    const MARKER_RE = /\[CONTENT_UPDATE\]([\s\S]*?)\[\/CONTENT_UPDATE\]/
    const match = responseText.match(MARKER_RE)
    let cleanedText = responseText
    let didUpdate = false
    if (match) {
      try {
        const update = JSON.parse(match[1].trim())
        const current = readContent() || defaultContent()
        writeContent({
          mine: update.mine ?? current.mine,
          hers: update.hers ?? current.hers,
          chibiMsgs: update.chibiMsgs ?? current.chibiMsgs,
        })
        didUpdate = true
        console.log('[content] updated via chat marker')
      } catch (e) { console.error('[content] marker parse error:', e.message) }
      cleanedText = responseText.replace(MARKER_RE, '').replace(/\n{3,}/g, '\n\n').trim()
    }

    // Extract [VOICE]English|中文[/VOICE] — English is spoken, 中文 is displayed.
    // Be tolerant: streamed model output sometimes drops the opening or closing
    // tag. Match by whichever tag is present, and never let a bare tag leak into
    // the chat as plain text.
    // Strip bare --- lines leaking in from the prompt's own section separators.
    cleanedText = cleanedText.replace(/^\s*-{3,}\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim()

    // Split the reply into ordered segments. A reply can hold multiple
    // [VOICE]English|中文[/VOICE] blocks interleaved with text; each voice block
    // becomes its own spoken message and everything streams in original order,
    // so no voice block is dropped and no bare tag leaks as plain text.
    const VOICE_G = /\[VOICE\]([\s\S]*?)\[\/VOICE\]/gi
    const segments = []
    let lastIdx = 0
    let vm
    while ((vm = VOICE_G.exec(cleanedText)) !== null) {
      const before = cleanedText.slice(lastIdx, vm.index)
      if (before.trim()) segments.push({ type: 'text', text: before })
      const [en, zh] = vm[1].split('|')
      const spoken = (en || '').trim()
      segments.push({ type: 'voice', en: spoken, zh: (zh || '').trim() || spoken })
      lastIdx = vm.index + vm[0].length
    }
    const tail = cleanedText.slice(lastIdx)
    if (tail.trim()) segments.push({ type: 'text', text: tail })

    // Clean text segments: drop any stray/unpaired VOICE tags so they never
    // reach the chat as plain text.
    for (const seg of segments) {
      if (seg.type === 'text') {
        seg.text = seg.text.replace(/\[\/?VOICE\]/gi, '').replace(/\n{3,}/g, '\n\n').trim()
      }
    }

    // Stream segments in original order.
    for (const seg of segments) {
      if (seg.type === 'text') {
        if (!seg.text) continue
        send({ text: seg.text, sessionId })
        msgs.push({ role: 'assistant', content: seg.text })
      } else {
        const audioId = seg.en ? await textToSpeech(seg.en) : null
        if (audioId) {
          send({ audioUrl: `/api/audio/${audioId}`, voiceText: seg.zh })
        } else if (seg.zh) {
          // TTS failed — still show the 中文 so the message isn't lost silently
          send({ text: seg.zh, sessionId })
        }
        msgs.push({ role: 'assistant', content: seg.zh || seg.en })
      }
    }
    sessions.set(sessionId, msgs.slice(-20))
    const transcript = segments
      .map(s => (s.type === 'text' ? s.text : (s.zh || s.en)))
      .filter(Boolean).join('\n')
    if (transcript) queueDigest(sessionId, `觎烬：${message}\n小克：${transcript}`)
    writeLastSeen()
    if (didUpdate) send({ contentUpdate: true })
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

  // Auto-import memory file only when content has changed
  setTimeout(() => {
    const memFile = path.join(REPO_PATH, '小克的记忆.md')
    const hashFile = path.join(REPO_PATH, '.memory_hash')
    try {
      const content = fs.readFileSync(memFile, 'utf-8')
      const hash = createHash('md5').update(content).digest('hex')
      const lastHash = readFileOr(hashFile).trim()
      if (hash === lastHash) { console.log('[memory] no changes, skip reimport'); return }
      console.log('[memory] file changed, reimporting...')
      const imp = spawn('node', [path.join(__dirname, 'import-memories.js')], {
        cwd: REPO_PATH, env: process.env, stdio: 'pipe',
      })
      let out = ''
      imp.stdout.on('data', d => { out += d.toString() })
      imp.stderr.on('data', d => { out += d.toString() })
      imp.on('close', code => {
        console.log('[memory] reimport done:', out.slice(-120).trim())
        if (code === 0) try { fs.writeFileSync(hashFile, hash) } catch {}
      })
    } catch (e) { console.error('[memory] hash check error:', e.message) }
  }, 5000)
})
