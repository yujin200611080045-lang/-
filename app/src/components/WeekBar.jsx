import { useState } from 'react'
import '../styles/WeekBar.css'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MOODS = ['晴', '云', '雨']
const MOOD_COLORS = { '晴': '#a0b8d0', '云': '#8a96a8', '雨': '#6b7f94' }

function todayIdx() {
  const d = new Date().getDay()
  return d === 0 ? 6 : d - 1
}

function weekKey() {
  const d = new Date()
  const startOfYear = new Date(d.getFullYear(), 0, 1)
  const weekNum = Math.ceil(((d - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7)
  return `week-moods-${d.getFullYear()}-${weekNum}`
}

export default function WeekBar() {
  const [moods, setMoods] = useState(() => {
    try {
      const saved = localStorage.getItem(weekKey())
      return saved ? JSON.parse(saved) : Array(7).fill(null)
    } catch {
      return Array(7).fill(null)
    }
  })

  const today = todayIdx()

  function cycleMood(i) {
    setMoods(prev => {
      const next = [...prev]
      const cur = next[i]
      const idx = MOODS.indexOf(cur)
      next[i] = idx === -1 ? MOODS[0] : idx === MOODS.length - 1 ? null : MOODS[idx + 1]
      try { localStorage.setItem(weekKey(), JSON.stringify(next)) } catch {}
      return next
    })
  }

  return (
    <div className="week-bar">
      {DAYS.map((day, i) => (
        <div
          key={day}
          className={`week-day${i === today ? ' today' : ''}`}
          onClick={() => cycleMood(i)}
        >
          <span className="week-label">{day}</span>
          <div
            className="mood-dot"
            style={moods[i] ? { background: MOOD_COLORS[moods[i]] } : {}}
          >
            {moods[i] && <span className="mood-char">{moods[i]}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
