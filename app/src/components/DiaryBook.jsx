import { useState } from 'react'
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
  const note = NOTES[idx]

  return (
    <div className="diary-wrap">
      {/* minimal nav, no title */}
      <div className="diary-topbar">
        <span className="diary-date-label">{note.date}</span>
        <div className="diary-nav">
          <button className="dnav-btn" onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}>‹</button>
          <button className="dnav-btn" onClick={() => setIdx(i => Math.min(NOTES.length - 1, i + 1))} disabled={idx === NOTES.length - 1}>›</button>
        </div>
      </div>

      {/* 3D Book */}
      <div className="diary-scene">
        <div className="diary-book">

          {/* Upper page — tilts top-away-from-viewer (opens upward) */}
          <div className="page-upper-wrap">
            <div className="page-stack ps-b" />
            <div className="page-stack ps-a" />
            <div className="page-upper">
              <span className="page-who">Cendres</span>
              <p className="page-text">{note.her}</p>
            </div>
          </div>

          {/* Spine */}
          <div className="book-spine" />

          {/* Lower page — tilts bottom-toward-viewer (opens downward) */}
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
