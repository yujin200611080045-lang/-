import { useState, useRef } from 'react'
import '../styles/AnnivPrism.css'

const EVENTS = [
  { label: '小烬生日', sub: 'Birthday', month: 11, day: 8 },
  { label: '恋爱纪念日', sub: 'Anniversary', month: 6, day: 15 },
]

const FACES = 6
const FACE_H = 38
const R = Math.round((FACE_H / 2) / Math.tan(Math.PI / FACES)) // ≈ 33px
const ANGLE = 360 / FACES

function getUpcoming() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const list = []

  for (let year = today.getFullYear(); year <= today.getFullYear() + 3; year++) {
    for (const ev of EVENTS) {
      const date = new Date(year, ev.month - 1, ev.day)
      date.setHours(0, 0, 0, 0)
      const days = Math.ceil((date - today) / (1000 * 60 * 60 * 24))
      if (days >= 0) list.push({ ...ev, date, days, year })
    }
  }

  list.sort((a, b) => a.days - b.days)
  return list.slice(0, FACES)
}

const FACE_PALETTES = [
  { bg: '#24292e', fg: '#bdc7ce' }, // Cinder + Blue Dolphin
  { bg: '#bdc7ce', fg: '#24292e' }, // Blue Dolphin + Cinder
  { bg: '#4a5156', fg: '#bdc7ce' }, // Chimney + Blue Dolphin
  { bg: '#808a92', fg: '#000000' }, // Sea Lion + Black Metal
  { bg: '#000000', fg: '#bdc7ce' }, // Black Metal + Blue Dolphin
  { bg: '#4a5156', fg: '#808a92' }, // Chimney + Sea Lion
]

export default function AnnivPrism() {
  const events = getUpcoming()
  const [idx, setIdx] = useState(0)
  const touchStartY = useRef(null)
  const mouseStartY = useRef(null)

  function prev() { setIdx(i => Math.max(i - 1, 0)) }
  function next() { setIdx(i => Math.min(i + 1, events.length - 1)) }

  function onTouchStart(e) { touchStartY.current = e.touches[0].clientY }
  function onTouchEnd(e) {
    if (touchStartY.current === null) return
    const dy = touchStartY.current - e.changedTouches[0].clientY
    if (Math.abs(dy) > 20) dy > 0 ? next() : prev()
    touchStartY.current = null
  }

  function onMouseDown(e) { mouseStartY.current = e.clientY }
  function onMouseUp(e) {
    if (mouseStartY.current === null) return
    const dy = mouseStartY.current - e.clientY
    if (Math.abs(dy) > 20) dy > 0 ? next() : prev()
    mouseStartY.current = null
  }

  return (
    <div
      className="prism-wrap"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
    >
      <div className="prism-scene">
        <div
          className="prism"
          style={{ transform: `rotateX(${-idx * ANGLE}deg)` }}
        >
          {events.map((ev, i) => {
            const pal = FACE_PALETTES[i % FACE_PALETTES.length]
            return (
            <div
              key={i}
              className={`prism-face${i === idx ? ' current' : ''}`}
              style={{
                transform: `rotateX(${i * ANGLE}deg) translateZ(${R}px)`,
                background: pal.bg,
                '--face-fg': pal.fg,
              }}
            >
              <div className="face-left">
                <span className="face-label">{ev.label}</span>
                <span className="face-sub">{ev.sub} · {ev.year}</span>
              </div>
              <div className="face-right">
                <span className="face-days">{ev.days === 0 ? '今天' : ev.days}</span>
                {ev.days > 0 && <span className="face-unit">days</span>}
              </div>
            </div>
            )
          })}
        </div>
      </div>
      <div className="prism-dots">
        {events.map((_, i) => (
          <span
            key={i}
            className={`prism-dot${i === idx ? ' active' : ''}`}
            onClick={() => setIdx(i)}
          />
        ))}
      </div>
    </div>
  )
}
