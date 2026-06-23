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

  const wrapperRef = useRef(null)
  const posRef = useRef({ x: 0, y: 0 })
  const dragOffset = useRef({ x: 0, y: 0 })
  const draggingRef = useRef(false)
  const tapStartRef = useRef({ x: 0, y: 0 })
  const lastTap = useRef(0)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Restart ripples each time the companion page becomes active
  useEffect(() => {
    if (location.pathname === '/companion') {
      setRippleKey(k => k + 1)
    }
  }, [location.pathname])

  // double-tap anywhere on background to exit
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

  function triggerBurst() {
    if (Math.random() >= 0.4) return
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
    setMessages(m => [...m, { text, side: 'sent', time }])
    setInputText('')
    if (mode === 'floating') triggerBurst()
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
    if (Math.hypot(dx, dy) < 6) triggerBurst()
  }

  const stopProp = e => e.stopPropagation()

  return (
    <div className="companion-page" onClick={handlePageTap}>

      {/* top bar */}
      <div className="chat-topbar" onClick={stopProp}>
        <span className="chat-name">江却</span>
      </div>

      {/* messages */}
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-bubble ${msg.side}`}>
            <span className="bubble-text">{msg.text}</span>
            <span className="bubble-time">{msg.time}</span>
          </div>
        ))}
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
      <div className="chat-inputbar" onClick={stopProp}>
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
