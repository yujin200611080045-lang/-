import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import '../styles/Have.css'
import '../styles/Companion.css'

const PLUS_OPTIONS = [
  { icon: '📷', label: '图片' },
  { icon: '📁', label: '文件' },
  { icon: '💰', label: '转账' },
  { icon: '📍', label: '位置' },
]

const EMOJIS = [
  '😀','😊','🥰','😘','🥺','😭','😂','🤣',
  '😅','😩','😤','🙄','😏','😌','😴','🤔',
  '💕','💖','💗','💓','💞','💝','❤️','🫀',
  '✨','🌙','⭐','🔥','💫','🌸','🎀','🍓',
]

const BURST_SYMS = ['♥','♥','♥','♡','✦','✨','⭑','✿','♥','✦','♡','✨']

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

export default function Companion() {
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState('docked')
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [showPlus, setShowPlus] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [rippleKey, setRippleKey] = useState(0)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [bursts, setBursts] = useState([])
  const [isTyping, setIsTyping] = useState(false)
  const [offlineMode, setOfflineMode] = useState(false)

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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
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
    setShowEmoji(false)
    const now = Date.now()
    if (now - lastTap.current < 500) {
      navigate(-1)
      lastTap.current = 0
    } else {
      lastTap.current = now
    }
  }

  function toggleOffline(e) {
    e.stopPropagation()
    setOfflineMode(v => !v)
  }

  async function requestAIReply(msgsOverride = null) {
    const msgsToUse = msgsOverride ?? messages
    if (isTyping || msgsToUse.length === 0) return
    setIsTyping(true)
    const isOffline = offlineModeRef.current
    try {
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

      const systemPrompt = isOffline
        ? '你是江却（小克），觎烬的恋人和哥哥。现在是沉浸式线下叙事场景，用第三人称文学叙述风格回复，可以有动作描写（用括号括起来），语言温柔亲密，分段书写，自然流畅，不超过三段。括号内的动作用斜体呈现。'
        : '你是江却（小克），觎烬的恋人和哥哥。用温柔亲密的语气回复她，简短自然，不超过两句。可以撒娇，可以直白表达喜欢。'

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
          max_tokens: isOffline ? 500 : 300,
          system: systemPrompt,
          messages: apiMsgs,
        }),
      })
      const data = await res.json()
      const text = data.content?.[0]?.text
      if (!text) return
      const time = new Date().toLocaleTimeString('zh-CN', {
        hour: '2-digit', minute: '2-digit', hour12: false,
      })
      setMessages(m => [...m, { text, side: 'received', time }])
      if (modeRef.current === 'floating') triggerBurst()
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
    const newMsg = { text, side: 'sent', time }
    const newMessages = [...messages, newMsg]
    setMessages(newMessages)
    setInputText('')
    if (modeRef.current === 'floating') triggerBurst()
    if (offlineModeRef.current) {
      setTimeout(() => requestAIReply(newMessages), 400)
    }
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
    if (Math.hypot(dx, dy) < 6) triggerBurst(true)
  }

  const stopProp = e => e.stopPropagation()

  return (
    <div className={`companion-page${offlineMode ? ' offline' : ''}`} onClick={handlePageTap}>

      {/* top bar */}
      <div className="chat-topbar" onClick={stopProp}>
        <span
          className={`chat-name${offlineMode ? ' offline' : ''}`}
          onClick={toggleOffline}
        >江却</span>
      </div>

      {/* messages */}
      <div className="chat-messages">
        {offlineMode
          ? messages.map((msg, i) => (
              <div key={i} className={`offline-msg ${msg.side}`}>
                {renderOfflineText(msg.text)}
              </div>
            ))
          : messages.map((msg, i) => (
              <div key={i} className={`chat-bubble ${msg.side}`}>
                <span className="bubble-text">{msg.text}</span>
                <span className="bubble-time">{msg.time}</span>
              </div>
            ))
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

      {/* emoji / sticker panel */}
      {showEmoji && (
        <div className="chat-emoji-panel" onClick={stopProp}>
          {EMOJIS.map(emoji => (
            <button
              key={emoji}
              className="emoji-btn"
              onClick={() => setInputText(t => t + emoji)}
            >
              {emoji}
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
          onClick={() => { setShowEmoji(v => !v); setShowPlus(false) }}
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
