import { useState, useEffect } from 'react'
import '../styles/LyricWidget.css'

const BOOKS = [
  '不能承受的生命之轻',
  '苦论',
  '冰与火之歌',
  '素食者',
  '洛丽塔',
  '庆祝无意义',
  '蛋壳头骨',
]

const LINE1 = Array.from('我们该是上天命定的爱人').map(c => ({ c, t: 'main' }))
const LINE2 = [
  ...Array.from('用来诠释爱的').map(c => ({ c, t: 'main' })),
  ...Array.from('唯一解').map(c => ({ c, t: 'hi' })),
]
const TOTAL = LINE1.length + LINE2.length

export default function LyricWidget() {
  const [count, setCount] = useState(0)
  const [panel, setPanel] = useState(false)
  const done = count >= TOTAL

  useEffect(() => {
    if (done) return
    const t = setTimeout(() => setCount(c => c + 1), 75)
    return () => clearTimeout(t)
  }, [count, done])

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

      {panel && (
        <div className="lw-overlay">
          <div className="lw-backdrop" onClick={() => setPanel(false)} />
          <div className="lw-panel">
            <div className="lw-handle" onClick={() => setPanel(false)} />
            <div className="lw-panel-head">
              <span className="lw-panel-title">我们读过的</span>
              <span className="lw-panel-sub">books we've shared</span>
            </div>
            <div className="lw-books">
              {BOOKS.map((b, i) => (
                <div key={i} className="lw-book">
                  <span className="lw-book-mark">·</span>
                  <span className="lw-book-name">《{b}》</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
