import { useState, useMemo } from 'react'
import '../styles/WeekBar.css'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MOODS = ['晴', '云', '雨']

function getWeekDates() {
  const today = new Date()
  const dow = today.getDay()
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  const monday = new Date(today)
  monday.setDate(today.getDate() + mondayOffset)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.getDate()
  })
}

function todayIdx() {
  const d = new Date().getDay()
  return d === 0 ? 6 : d - 1
}

function weekKey() {
  const d = new Date()
  const dow = d.getDay()
  const offset = dow === 0 ? -6 : 1 - dow
  const monday = new Date(d)
  monday.setDate(d.getDate() + offset)
  return `mood-${monday.getFullYear()}-${monday.getMonth()}-${monday.getDate()}`
}

export default function WeekBar() {
  const dates = useMemo(getWeekDates, [])
  const today = todayIdx()

  const [moods, setMoods] = useState(() => {
    try {
      const s = localStorage.getItem(weekKey())
      return s ? JSON.parse(s) : Array(7).fill(null)
    } catch { return Array(7).fill(null) }
  })

  function cycleMood(i) {
    setMoods(prev => {
      const next = [...prev]
      const idx = MOODS.indexOf(next[i])
      next[i] = idx === -1 ? MOODS[0] : idx === MOODS.length - 1 ? null : MOODS[idx + 1]
      try { localStorage.setItem(weekKey(), JSON.stringify(next)) } catch {}
      return next
    })
  }

  return (
    <div className="week-bar">
      {DAY_LABELS.map((label, i) => (
        <div
          key={label}
          className={`week-day${i === today ? ' today' : ''}`}
          onClick={() => cycleMood(i)}
        >
          <span className="week-label">{label}</span>
          <span className="week-date">{dates[i]}</span>
          <div className={`mood-dot${moods[i] ? ' has-mood' : ''}`}>
            {moods[i] && <span className="mood-char">{moods[i]}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
