import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import '../styles/LyricWidget.css'

const INIT_BOOKS = [
  '不能承受的生命之轻',
  '苦论',
  '冰与火之歌',
  '素食者',
  '洛丽塔',
  '庆祝无意义',
  '蛋壳头骨',
].map(name => ({ name, done: false }))

const LINE1 = Array.from('我们该是上天命定的爱人').map(c => ({ c, t: 'main' }))
const LINE2 = [
  ...Array.from('用来诠释爱的').map(c => ({ c, t: 'main' })),
  ...Array.from('唯一解').map(c => ({ c, t: 'hi' })),
]
const TOTAL = LINE1.length + LINE2.length

export default function LyricWidget() {
  const [count, setCount] = useState(0)
  const [panel, setPanel] = useState(false)
  const [books, setBooks] = useState(INIT_BOOKS)
  const [newBook, setNewBook] = useState('')
  const inputRef = useRef(null)
  const booksRef = useRef(null)
  const done = count >= TOTAL

  useEffect(() => {
    if (panel && booksRef.current) {
      booksRef.current.scrollTop = 0
    }
  }, [panel])

  useEffect(() => {
    if (done) return
    const t = setTimeout(() => setCount(c => c + 1), 75)
    return () => clearTimeout(t)
  }, [count, done])

  function toggleDone(i) {
    setBooks(prev => prev.map((b, idx) => idx === i ? { ...b, done: !b.done } : b))
  }

  function submitBook() {
    if (!newBook.trim()) return
    setBooks(prev => [...prev, { name: newBook.trim(), done: false }])
    setNewBook('')
  }

  function closePanel() {
    setPanel(false)
    setNewBook('')
  }

  return (
    <>
      <div
        className={`lw-wrap${done ? ' lw-done' : ''}`}
        onClick={() => done && setPanel(true)}
      >
        <span className="lw-flourish">for you, always —</span>
        <p className="lw-text lw-line1">
          {LINE1.slice(0, count).map((tok, i) => (
            <span key={i} className={`lw-${tok.t}`}>{tok.c}</span>
          ))}
          {!done && count <= LINE1.length && <span className="lw-cursor" />}
        </p>
        <p className="lw-text lw-line2">
          {LINE2.slice(0, Math.max(0, count - LINE1.length)).map((tok, i) => (
            <span key={i} className={`lw-${tok.t}`}>{tok.c}</span>
          ))}
          {!done && count > LINE1.length && <span className="lw-cursor" />}
        </p>
      </div>

      {panel && createPortal(
        <div className="lw-overlay">
          <div className="lw-backdrop" onClick={closePanel} />
          <div className="lw-panel">
            <div className="lw-handle" onClick={closePanel} />
            <div className="lw-panel-head">
              <span className="lw-panel-title">我们读过的</span>
              <span className="lw-panel-sub">books we've shared</span>
            </div>
            <div className="lw-books" ref={booksRef}>
              {books.map((b, i) => (
                <div key={i} className="lw-book" onClick={() => toggleDone(i)}>
                  <span className="lw-book-mark">·</span>
                  <span className={`lw-book-name${b.done ? ' lw-book-done' : ''}`}>《{b.name}》</span>
                </div>
              ))}
              <div className="lw-book lw-book-add" onClick={() => inputRef.current?.focus()}>
                <span className="lw-book-mark">·</span>
                <input
                  ref={inputRef}
                  className="lw-add-inline"
                  placeholder="加一本…"
                  value={newBook}
                  onChange={e => setNewBook(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitBook()}
                  onBlur={submitBook}
                />
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
