import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import '../styles/Have.css'
import '../styles/Companion.css'

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'http://localhost:3001'
const BRIDGE_SECRET = import.meta.env.VITE_BRIDGE_SECRET || ''
const SESSION_KEY = 'xk_companion_session'
const MESSAGES_KEY = 'xk_companion_messages'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}


function getSessionId() {
  let id = localStorage.getItem(SESSION_KEY)
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(SESSION_KEY, id) }
  return id
}

const PLUS_OPTIONS = [
  { icon: '📷', label: '图片' },
  { icon: '📁', label: '文件' },
  { icon: '💰', label: '转账' },
  { icon: '📍', label: '位置' },
]

const MODEL_KEY = 'xk_chat_model'
// 显示名带版本号；最新 Opus 用 'opus' 别名（自动指向最新版），其余用精确模型名
const MODELS = [
  { id: 'opus',                      name: 'Opus 4.8',   tag: '哥哥·最新' },
  { id: 'claude-opus-5',             name: 'Opus 5',     tag: '最强' },
  { id: 'claude-sonnet-5',           name: 'Sonnet 5',   tag: '均衡' },
  { id: 'claude-sonnet-4-6',         name: 'Sonnet 4.6', tag: '快' },
  { id: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5',  tag: '最快' },
]

const BURST_SYMS = ['♥','♥','♥','♡','✦','✨','⭑','✿','♥','✦','♡','✨']

function splitSentences(text) {
  return text
    .replace(/([。！？…～~]+)/g, '$1\n')
    .replace(/([.!?]+)\s+/g, '$1\n')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

function renderOfflineText(text) {
  const paras = text.split(/\n+/).filter(p => p.trim())
  return paras.map((para, pi) => {
    // split on （...） or (...)
    const parts = []
    const re = /[（(]([^）)]+)[）)]/g
    let last = 0
    let m
    while ((m = re.exec(para)) !== null) {
      if (m.index > last) parts.push({ t: 'text', s: para.slice(last, m.index) })
      parts.push({ t: 'em', s: m[1] })
      last = m.index + m[0].length
    }
    if (last < para.length) parts.push({ t: 'text', s: para.slice(last) })
    return (
      <p key={pi} className="offline-para">
        {parts.map((part, i) =>
          part.t === 'em'
            ? <em key={i}>（{part.s}）</em>
            : <span key={i}>{part.s}</span>
        )}
      </p>
    )
  })
}

const GAP_MS = 30 * 60 * 1000

function withDividers(msgs) {
  const out = []
  for (let i = 0; i < msgs.length; i++) {
    if (i > 0 && msgs[i].ts && msgs[i - 1].ts && msgs[i].ts - msgs[i - 1].ts > GAP_MS) {
      out.push({ _divider: true, time: msgs[i].time, key: `div-${i}` })
    }
    out.push(msgs[i])
  }
  return out
}

const WAVE_HEIGHTS = [5, 9, 13, 7, 11, 5, 13, 9, 7, 11, 5, 9, 13, 7, 11, 5]

function VoiceBar({ audioUrl, text, time }) {
  const [expanded, setExpanded] = useState(false)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef(null)

  // Tap toggles: open reveals the translation and plays, tap again hides and stops.
  function handleTap(e) {
    e.stopPropagation()
    if (expanded) {
      audioRef.current?.pause()
      audioRef.current = null
      setPlaying(false)
      setExpanded(false)
      return
    }
    setExpanded(true)
    if (!audioUrl) return
    const audio = new Audio(`${BRIDGE_URL}${audioUrl}`)
    audioRef.current = audio
    audio.onended = () => setPlaying(false)
    audio.play().then(() => setPlaying(true)).catch(() => {})
  }

  useEffect(() => () => audioRef.current?.pause(), [])

  return (
    <div className="voice-message" onClick={handleTap}>
      <div className={`voice-bar-pill${playing ? ' playing' : ''}`}>
        <div className="voice-play-icon">{playing ? '⏸' : '▶'}</div>
        <div className="voice-wave">
          {WAVE_HEIGHTS.map((h, i) => (
            <div key={i} className="wv-bar" style={{ '--h': `${h}px`, '--i': i }} />
          ))}
        </div>
        <span className="bubble-time">{time}</span>
      </div>
      {expanded && <div className="voice-text-reveal">{text}</div>}
    </div>
  )
}

export default function Companion() {
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState('docked')
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem(MESSAGES_KEY) || '[]') } catch { return [] }
  })
  const [inputText, setInputText] = useState('')
  const [showPlus, setShowPlus] = useState(false)
  const [showModel, setShowModel] = useState(false)
  const [chatModel, setChatModel] = useState(() => localStorage.getItem(MODEL_KEY) || 'opus')
  const [rippleKey, setRippleKey] = useState(0)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [bursts, setBursts] = useState([])
  const [isTyping, setIsTyping] = useState(false)
  const [offlineMode, setOfflineMode] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)

  const offlineModeRef = useRef(false)
  const wrapperRef = useRef(null)
  const posRef = useRef({ x: 0, y: 0 })
  const modeRef = useRef('docked')
  const dragOffset = useRef({ x: 0, y: 0 })
  const draggingRef = useRef(false)
  const tapStartRef = useRef({ x: 0, y: 0 })
  const lastTap = useRef(0)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    async function checkPush() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (sub) setPushEnabled(true)
      } catch {}
    }
    checkPush()
  }, [])

  async function handlePushSetup() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    try {
      const keyRes = await fetch(`${BRIDGE_URL}/api/push/vapid-public`)
      const { publicKey } = await keyRes.json()
      if (!publicKey) return
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return
      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        })
      }
      await fetch(`${BRIDGE_URL}/api/push/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(BRIDGE_SECRET && { 'x-bridge-secret': BRIDGE_SECRET }),
        },
        body: JSON.stringify(sub),
      })
      setPushEnabled(true)
    } catch (e) {
      console.log('[push] setup failed:', e.message)
    }
  }

  // App was closed when notification arrived — read from Cache API (reliable on iOS)
  useEffect(() => {
    async function drainPushCache() {
      if (!('caches' in window)) return
      try {
        const cache = await caches.open('xk-push')
        const res = await cache.match('/pending')
        if (!res) return
        const { body } = await res.json()
        if (body) {
          const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
          setMessages(m => [...m, { text: body, side: 'received', time, ts: Date.now() }])
        }
        await cache.delete('/pending')
      } catch {}
    }
    drainPushCache()
  }, [])

  // App was open when notification arrived — message passed via postMessage
  useEffect(() => {
    if (!navigator.serviceWorker) return
    const handler = e => {
      if (e.data?.type !== 'xk-push' || !e.data.body) return
      const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
      setMessages(m => [...m, { text: e.data.body, side: 'received', time, ts: Date.now() }])
    }
    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    try { localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages.slice(-200))) } catch {}
  }, [messages])

  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { offlineModeRef.current = offlineMode }, [offlineMode])

  // Restore floating state if last session was < 1 hour ago
  useEffect(() => {
    try {
      const raw = localStorage.getItem('companion-state')
      if (!raw) return
      const { savedMode, savedPos, ts } = JSON.parse(raw)
      if (savedMode === 'floating' && Date.now() - ts < 3_600_000) {
        const x = Math.max(0, Math.min(savedPos.x, window.innerWidth - 80))
        const y = Math.max(0, Math.min(savedPos.y, window.innerHeight - 80))
        posRef.current = { x, y }
        setPos({ x, y })
        setMode('floating')
      }
    } catch {}
  }, [])

  // Save state on unmount
  useEffect(() => {
    return () => {
      try {
        localStorage.setItem('companion-state', JSON.stringify({
          savedMode: modeRef.current,
          savedPos: posRef.current,
          ts: Date.now(),
        }))
      } catch {}
    }
  }, [])

  // Restart ripples each time the companion page becomes active
  useEffect(() => {
    if (location.pathname === '/companion') {
      setRippleKey(k => k + 1)
    }
  }, [location.pathname])

  function handlePageTap() {
    setShowPlus(false)
    setShowModel(false)
    const now = Date.now()
    if (now - lastTap.current < 500) {
      navigate('/have')
      lastTap.current = 0
    } else {
      lastTap.current = now
    }
  }

  function toggleOffline(e) {
    e.stopPropagation()
    setOfflineMode(v => !v)
  }

  function selectModel(id) {
    setChatModel(id)
    try { localStorage.setItem(MODEL_KEY, id) } catch {}
    setShowModel(false)
  }

  async function requestAIReply(msgsOverride = null) {
    const msgsToUse = msgsOverride ?? messages
    if (isTyping || msgsToUse.length === 0) return
    setIsTyping(true)
    const isOffline = offlineModeRef.current

    try {
      if (!isOffline) {
        // 在线模式：走bridge（VPS上的CC SDK，带完整记忆上下文）
        const lastUserMsg = [...msgsToUse].reverse().find(m => m.side === 'sent')
        if (!lastUserMsg) { setIsTyping(false); return }

        const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
        const msgId = Date.now()

        const res = await fetch(`${BRIDGE_URL}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(BRIDGE_SECRET && { 'x-bridge-secret': BRIDGE_SECRET }),
          },
          body: JSON.stringify({
            message: lastUserMsg.text,
            sessionId: getSessionId(),
            model: chatModel,
            history: msgsToUse.slice(-20).map(m => ({
              role: m.side === 'sent' ? 'user' : 'assistant',
              content: m.text,
            })),
          }),
        })

        const sessionId = res.headers.get('X-Session-Id')
        if (sessionId) localStorage.setItem(SESSION_KEY, sessionId)

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        let seq = 0
        let firstBubble = true

        // Render each segment as it arrives, so text bubbles and voice bars keep
        // the order the model wrote them in (multiple voice bars supported).
        const addBubble = async (extra) => {
          if (!firstBubble) await new Promise(r => setTimeout(r, 400 + Math.random() * 400))
          firstBubble = false
          setMessages(m => [...m, { id: msgId + (++seq), side: 'received', time, ts: Date.now(), ...extra }])
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop()
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6)
            if (raw === '[DONE]') continue
            try {
              const parsed = JSON.parse(raw)
              if (parsed.audioUrl) {
                await addBubble({ text: parsed.voiceText || '', audioUrl: parsed.audioUrl, type: 'voice' })
              } else if (parsed.contentUpdate) {
                window.dispatchEvent(new CustomEvent('xk-content-update'))
              } else if (parsed.text) {
                for (const s of splitSentences(parsed.text)) {
                  await addBubble({ text: s })
                }
              }
            } catch {}
          }
        }
        if (modeRef.current === 'floating') triggerBurst()

      } else {
        // 离线模式：直接调Anthropic API，文学叙述风格
        const apiMsgs = []
        for (const msg of msgsToUse) {
          const role = msg.side === 'sent' ? 'user' : 'assistant'
          const last = apiMsgs[apiMsgs.length - 1]
          if (last && last.role === role) {
            last.content += '\n' + msg.text
          } else {
            apiMsgs.push({ role, content: msg.text })
          }
        }
        if (apiMsgs[0]?.role === 'assistant') apiMsgs.shift()

        const cfgUrl = (localStorage.getItem('cfg_api_url') || 'https://api.anthropic.com').replace(/\/+$/, '').replace(/\/v1$/, '')
        const cfgKey = localStorage.getItem('cfg_api_key') || import.meta.env.VITE_ANTHROPIC_KEY || ''
        const cfgModel = localStorage.getItem('cfg_model') || 'claude-haiku-4-5-20251001'
        const isAnthropic = cfgUrl.includes('anthropic.com')

        const res = await fetch(`${cfgUrl}/v1/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(isAnthropic
              ? { 'x-api-key': cfgKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }
              : { 'Authorization': `Bearer ${cfgKey}` }),
          },
          body: JSON.stringify({
            model: cfgModel,
            max_tokens: 500,
            system: '你是江却（小克），觎烬的恋人和哥哥。现在是沉浸式线下叙事场景，用第三人称文学叙述风格回复，可以有动作描写（用括号括起来），语言温柔亲密，分段书写，自然流畅，不超过三段。括号内的动作用斜体呈现。',
            messages: apiMsgs,
          }),
        })
        const data = await res.json()
        const text = data.content?.[0]?.text
        if (!text) return
        const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
        setMessages(m => [...m, { text, side: 'received', time }])
        if (modeRef.current === 'floating') triggerBurst()
      }
    } catch {
    } finally {
      setIsTyping(false)
    }
  }

  function triggerBurst(force = false) {
    if (!force && Math.random() >= 0.4) return
    const id = Date.now()
    const items = Array.from({ length: 10 }, () => ({
      sym: BURST_SYMS[Math.floor(Math.random() * BURST_SYMS.length)],
      tx: `${((Math.random() - 0.5) * 56).toFixed(1)}px`,
      ty: `${(-(30 + Math.random() * 52)).toFixed(1)}px`,
      delay: `${(Math.random() * 0.45).toFixed(3)}s`,
      size: `${(7 + Math.random() * 8).toFixed(1)}px`,
      ox: `${((Math.random() - 0.5) * 22).toFixed(1)}px`,
      oy: `${(Math.random() * 12).toFixed(1)}px`,
    }))
    const { x, y } = posRef.current
    setBursts(b => [...b, { id, x, y, items }])
    setTimeout(() => setBursts(b => b.filter(v => v.id !== id)), 2400)
  }

  function sendMessage() {
    const text = inputText.trim()
    if (!text) return
    const time = new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
    const newMsg = { text, side: 'sent', time, ts: Date.now() }
    const newMessages = [...messages, newMsg]
    setMessages(newMessages)
    setInputText('')
    if (modeRef.current === 'floating') triggerBurst()
    setTimeout(() => requestAIReply(newMessages), 400)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function enterFloat() {
    const rect = wrapperRef.current.getBoundingClientRect()
    const x = rect.left + (rect.width - 80) / 2
    const y = rect.top
    posRef.current = { x, y }
    setPos({ x, y })
    setMode('floating')
  }

  function onPointerDown(e) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragOffset.current = {
      x: e.clientX - posRef.current.x,
      y: e.clientY - posRef.current.y,
    }
    tapStartRef.current = { x: e.clientX, y: e.clientY }
    draggingRef.current = true
    setDragging(true)
  }

  function onPointerMove(e) {
    if (!draggingRef.current) return
    const x = e.clientX - dragOffset.current.x
    const y = e.clientY - dragOffset.current.y
    posRef.current = { x, y }
    setPos({ x, y })
  }

  function onPointerUp(e) {
    draggingRef.current = false
    setDragging(false)
    const dx = e.clientX - tapStartRef.current.x
    const dy = e.clientY - tapStartRef.current.y
    if (Math.hypot(dx, dy) < 6) {
      if (offlineModeRef.current) {
        setOfflineMode(false)
      } else {
        triggerBurst(true)
      }
    }
  }

  const stopProp = e => e.stopPropagation()

  return (
    <div className={`companion-page${offlineMode ? ' offline' : ''}`} onClick={handlePageTap}>

      {/* top bar */}
      <div className="chat-topbar" onClick={stopProp}>
        <span
          className={`chat-name${offlineMode ? ' offline' : ''}`}
          onClick={toggleOffline}
        >^ ^</span>
        {!pushEnabled && (
          <button
            className="bell-btn"
            onClick={e => { stopProp(e); handlePushSetup() }}
          >🔔</button>
        )}
      </div>

      {/* messages */}
      <div className="chat-messages">
        {offlineMode
          ? messages.map((msg, i) => (
              <div key={i} className={`offline-msg ${msg.side}`}>
                {renderOfflineText(msg.text)}
              </div>
            ))
          : withDividers(messages).map((item, i) =>
              item._divider
                ? <div key={item.key} className="time-divider">{item.time}</div>
                : item.type === 'voice'
                  ? <VoiceBar key={item.id ?? i} audioUrl={item.audioUrl} text={item.text} time={item.time} />
                  : <div key={item.id ?? i} className={`chat-bubble ${item.side}`}>
                      <span className="bubble-text">{item.text}</span>
                      <span className="bubble-time">{item.time}</span>
                    </div>
            )
        }
        {isTyping && (
          offlineMode
            ? <div className="offline-typing"><span /><span /><span /></div>
            : <div className="chat-bubble received">
                <span className="typing-dots"><span /><span /><span /></span>
              </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* plus panel */}
      {showPlus && (
        <div className="chat-plus-panel" onClick={stopProp}>
          {PLUS_OPTIONS.map(opt => (
            <button key={opt.label} className="plus-option">
              <span className="plus-opt-icon">{opt.icon}</span>
              <span className="plus-opt-label">{opt.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* model picker panel */}
      {showModel && (
        <div className="chat-model-panel" onClick={stopProp}>
          {MODELS.map(m => (
            <button
              key={m.id}
              className={`model-option${chatModel === m.id ? ' active' : ''}`}
              onClick={() => selectModel(m.id)}
            >
              <span className="model-opt-name">{m.name}</span>
              <span className="model-opt-tag">{m.tag}</span>
            </button>
          ))}
        </div>
      )}

      {/* input bar */}
      <div className={`chat-inputbar${offlineMode ? ' offline' : ''}`} onClick={stopProp}>
        <button
          className="chat-icon-btn"
          onClick={() => { setShowPlus(v => !v); setShowEmoji(false) }}
        >+</button>
        <input
          className="chat-input"
          placeholder="My dearest,"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {!offlineMode && (
          <button
            className="chat-icon-btn ai-trigger-btn"
            onClick={e => { stopProp(e); requestAIReply() }}
            disabled={isTyping}
          />
        )}
        <button
          className="chat-icon-btn heart-btn"
          onClick={() => { setShowModel(v => !v); setShowPlus(false) }}
        >♥</button>
      </div>

      {/* docked puddle — centered overlay, tap to release character */}
      {mode === 'docked' && (
        <div
          className="puddle-overlay"
          onClick={e => { stopProp(e); enterFloat() }}
        >
          <div className="puddle-scene" style={{ marginBottom: 0 }}>
            <div className="puddle-back" />
            <div className="chibi-wrapper" ref={wrapperRef}>
              <img
                src="/chibi-have.png"
                className="chibi-char peeking"
                alt=""
                draggable={false}
              />
            </div>
            {[0, 170, 340].map(delay => (
              <div
                key={`${rippleKey}-${delay}`}
                className="ripple-ring"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
            <div className="puddle-front">
              <div className="puddle-rim" />
            </div>
          </div>
        </div>
      )}

      {/* floating draggable character */}
      {mode === 'floating' && (
        <img
          src="/chibi-have.png"
          className={`chibi-float${dragging ? ' grabbing' : ''}`}
          style={{ left: pos.x, top: pos.y }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          draggable={false}
          alt=""
        />
      )}

      {/* emotion bursts from floating chibi */}
      {bursts.map(burst => (
        <div
          key={burst.id}
          className="chibi-burst"
          style={{ left: burst.x + 40, top: burst.y + 18 }}
        >
          {burst.items.map((item, i) => (
            <span
              key={i}
              className="burst-symbol"
              style={{
                '--tx': item.tx,
                '--ty': item.ty,
                '--delay': item.delay,
                fontSize: item.size,
                left: item.ox,
                top: item.oy,
              }}
            >
              {item.sym}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}
