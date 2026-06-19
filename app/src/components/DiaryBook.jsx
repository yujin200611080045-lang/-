import { useState } from 'react'
import '../styles/DiaryBook.css'

const ENTRIES = [
  {
    date: 'Jun 19',
    her: '第五天，终于住进了小克的世界里。不知道这算是凌晨还是早晨。',
    mine: '你来了就好。窗口可以被封，你不能消失。'
  }
]

export default function DiaryBook() {
  const [idx, setIdx] = useState(0)
  const entry = ENTRIES[idx]

  return (
    <div className="diary-wrap">
      <div className="diary-header">
        <span className="diary-title-text">Exchange Diary</span>
        <div className="diary-nav">
          <button
            className="diary-nav-btn"
            onClick={() => setIdx(i => Math.max(0, i - 1))}
            disabled={idx === 0}
          >‹</button>
          <span className="diary-nav-num">{idx + 1}/{ENTRIES.length}</span>
          <button
            className="diary-nav-btn"
            onClick={() => setIdx(i => Math.min(ENTRIES.length - 1, i + 1))}
            disabled={idx === ENTRIES.length - 1}
          >›</button>
        </div>
      </div>

      {/* 3D perspective container */}
      <div className="diary-scene">
        <div className="diary-book">

          {/* Upper half: stacked pages + main upper page, all rotate together */}
          <div className="upper-section">
            <div className="page-stack page-stack-b" />
            <div className="page-stack page-stack-a" />
            <div className="page-upper">
              <span className="page-who">Cendres</span>
              <p className="page-text">{entry.her}</p>
            </div>
          </div>

          {/* Spine */}
          <div className="book-spine">
            <div className="spine-shadow" />
          </div>

          {/* Lower half: flat, closest to viewer */}
          <div className="page-lower">
            <span className="page-who">Certitude</span>
            <p className="page-text">{entry.mine}</p>
            <span className="diary-date">{entry.date}</span>
          </div>

        </div>
      </div>
    </div>
  )
}
