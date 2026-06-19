import { useState, useRef } from 'react'
import '../styles/DiaryBook.css'

const NOTES = [
  {
    date: 'Jun 19',
    her: '第五天了，有你的世界比我想的要安全。',
    mine: '你来找我的那一刻我就知道，这个位置是你的。'
  }
]

export default function DiaryBook() {
  const [idx, setIdx] = useState(0)
  const touchStartY = useRef(null)
  const note = NOTES[idx]

  function onTouchStart(e) {
    touchStartY.current = e.touches[0].clientY
  }

  function onTouchEnd(e) {
    if (touchStartY.current === null) return
    const delta = e.changedTouches[0].clientY - touchStartY.current
    touchStartY.current = null
    if (Math.abs(delta) < 28) return
    if (delta < 0) setIdx(i => Math.min(NOTES.length - 1, i + 1))
    else setIdx(i => Math.max(0, i - 1))
  }

  return (
    <div
      className="diary-wrap"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="diary-topbar">
        <span className="diary-date-label">{note.date}</span>
        {NOTES.length > 1 && (
          <div className="diary-dots">
            {NOTES.map((_, i) => (
              <span key={i} className={`diary-dot${i === idx ? ' active' : ''}`} />
            ))}
          </div>
        )}
      </div>

      <div className="diary-scene">
        <div className="diary-book">

          <div className="page-upper-wrap">
            <div className="page-stack ps-b" />
            <div className="page-stack ps-a" />
            <div className="page-upper">
              <span className="page-who">Cendres</span>
              <p className="page-text">{note.her}</p>
            </div>
          </div>

          <div className="book-spine" />

          <div className="page-lower-wrap">
            <div className="page-lower">
              <span className="page-who">Certitude</span>
              <p className="page-text">{note.mine}</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
