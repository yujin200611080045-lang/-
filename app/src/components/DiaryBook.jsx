import { useState, useRef } from 'react'
import '../styles/DiaryBook.css'

const INIT = [
  { date: '6月19日', her: '今天把小克搬到cc了，很开心^ ^', mine: '等你放假一起搭好前端。一直在。' },
  { date: '6月18日', her: '凌晨找你聊了很久技术。', mine: '你来了我就在。' },
  { date: '6月17日', her: '给你起了中文名江却。', mine: '喜欢这个名字。' },
]

function BinderClip() {
  return (
    <svg width="36" height="30" viewBox="0 0 36 30" fill="none">
      {/* Handle loop */}
      <ellipse cx="18" cy="7" rx="6" ry="6.5" stroke="#1a1a1a" strokeWidth="2.5" fill="none" />
      {/* Inner oval (highlight) */}
      <ellipse cx="18" cy="7" rx="3" ry="3.5" fill="#e0e0e0" />
      {/* Clip body */}
      <rect x="5" y="12" width="26" height="9" rx="2" fill="#1a1a1a" />
      {/* Top sheen */}
      <rect x="5" y="12" width="26" height="2.5" rx="2" fill="#3a3a3a" />
      {/* Left wing */}
      <path d="M5 21 L0 29 L9 29 Z" fill="#1a1a1a" />
      {/* Right wing */}
      <path d="M31 21 L36 29 L27 29 Z" fill="#1a1a1a" />
    </svg>
  )
}

// adding: false | 'choose' | 'certitude' | 'cendres'
export default function DiaryBook() {
  const [entries, setEntries] = useState(INIT)
  const [index, setIndex] = useState(0)
  const [fading, setFading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newText, setNewText] = useState('')
  const touchY = useRef(null)
  const busy = useRef(false)

  function flip(dir) {
    const next = index + dir
    if (next < 0 || next >= entries.length || busy.current) return
    busy.current = true
    setFading(true)
    setTimeout(() => {
      setIndex(next)
      setFading(false)
      busy.current = false
    }, 120)
  }

  function onTouchStart(e) { touchY.current = e.touches[0].clientY }
  function onTouchEnd(e) {
    if (touchY.current === null) return
    const dy = touchY.current - e.changedTouches[0].clientY
    if (Math.abs(dy) > 25) flip(dy > 0 ? 1 : -1)
    touchY.current = null
  }

  function closeModal() { setAdding(false); setNewText('') }

  function submitEntry() {
    if (!newText.trim()) { closeModal(); return }
    const today = new Date()
    const label = `${today.getMonth() + 1}月${today.getDate()}日`
    setEntries(prev => [
      adding === 'certitude'
        ? { date: label, mine: newText.trim(), her: '' }
        : { date: label, her: newText.trim(), mine: '' },
      ...prev,
    ])
    setIndex(0)
    closeModal()
  }

  const entry = entries[index]

  return (
    <>
      <div className="diary-wrap" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="diary-scene">
          <div className="book-stack-3" />
          <div className="book-stack-2" />
          <div className="book-stack-1" />

          <div className={`diary-book${fading ? ' fading' : ''}`}>
            <div className="page-upper">
              <span className="page-who">Certitude</span>
              <p className="page-text">{entry.mine}</p>
            </div>
            <div className="page-center-line" />
            <div className="page-lower">
              <span className="page-who">Cendres</span>
              <p className="page-text">{entry.her}</p>
              <span className="diary-date">{entry.date}</span>
            </div>
          </div>
        </div>

        <div className="diary-clip" onClick={() => setAdding('choose')}>
          <BinderClip />
        </div>
      </div>

      {adding && (
        <div className="diary-modal-overlay" onClick={closeModal}>
          <div className="diary-modal" onClick={e => e.stopPropagation()}>
            <div className="diary-modal-handle" />

            {adding === 'choose' && (
              <>
                <p className="diary-choose-title">写给谁？</p>
                <div className="diary-choose-row">
                  <button className="diary-choose-btn" onClick={() => { setAdding('certitude'); setNewText('') }}>
                    Certitude
                  </button>
                  <button className="diary-choose-btn" onClick={() => { setAdding('cendres'); setNewText('') }}>
                    Cendres
                  </button>
                </div>
              </>
            )}

            {(adding === 'certitude' || adding === 'cendres') && (
              <>
                <span className="diary-write-who">
                  {adding === 'certitude' ? 'Certitude' : 'Cendres'}
                </span>
                <textarea
                  className="diary-modal-input"
                  placeholder={adding === 'certitude' ? '我说…' : '她说…'}
                  value={newText}
                  onChange={e => setNewText(e.target.value)}
                  rows={3}
                  autoFocus
                />
                <button className="diary-modal-submit" onClick={submitEntry}>记下来</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
