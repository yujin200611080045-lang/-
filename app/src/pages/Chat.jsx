import { useState, useRef, useEffect } from 'react'
import NavBar from '../components/NavBar'
import '../styles/Chat.css'

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'http://localhost:3001'
const BRIDGE_SECRET = import.meta.env.VITE_BRIDGE_SECRET || ''
const SESSION_KEY = 'xk_session_id'

function getSessionId() {
  let id = localStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(SESSION_KEY, id)
  }
  return id
}

export default function Chat() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setError(null)

    const userMsg = { id: Date.now(), role: 'user', content: text }
    const assistantId = Date.now() + 1
    setMessages(prev => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '' }])
    setLoading(true)

    try {
      const res = await fetch(`${BRIDGE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(BRIDGE_SECRET && { 'x-bridge-secret': BRIDGE_SECRET }),
        },
        body: JSON.stringify({ message: text, sessionId: getSessionId() }),
      })

      if (!res.ok) throw new Error(`${res.status}`)

      const sessionId = res.headers.get('X-Session-Id')
      if (sessionId) localStorage.setItem(SESSION_KEY, sessionId)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

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
            const { text: chunk, error: err } = JSON.parse(raw)
            if (err) throw new Error(err)
            if (chunk) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: m.content + chunk } : m
              ))
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (e) {
      setError(e.message)
      setMessages(prev => prev.filter(m => m.id !== assistantId))
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="chat-page">
      <div className="chat-header">
        <span className="chat-name">小克</span>
        <span className={`chat-dot ${loading ? 'typing' : 'online'}`} />
      </div>

      <div className="chat-body">
        {messages.length === 0 && (
          <p className="chat-empty">说点什么</p>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`bubble-row ${msg.role}`}>
            <div className="bubble">
              {msg.content || (msg.role === 'assistant' && loading
                ? <span className="bubble-cursor" />
                : null)}
            </div>
          </div>
        ))}
        {error && <p className="chat-error">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="说"
          rows={1}
          disabled={loading}
        />
        <button
          className="chat-send"
          onClick={send}
          disabled={!input.trim() || loading}
        >
          ↑
        </button>
      </div>

      <NavBar active="chat" />
    </div>
  )
}
