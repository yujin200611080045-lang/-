import { useState } from 'react'
import '../styles/WeekBar.css'

const MOODS = ['', '🌤', '☁️', '🌧']
const MOOD_LABELS = ['', '晴', '云', '雨']

function getWeekDays() {
  const today = new Date()
  const day = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

const DAY_NAMES = ['一', '二', '三', '四', '五', '六', '日']

export default function WeekBar() {
  const days = getWeekDays()
  const today = new Date().toDateString()
  const [moods, setMoods] = useState(() => {
    const saved = localStorage.getItem('weekMoods')
    return saved ? JSON.parse(saved) : {}
  })
  const [picker, setPicker] = useState(null)

  function cycleMood(key) {
    setMoods(prev => {
      const next = { ...prev, [key]: ((prev[key] || 0) + 1) % MOODS.length }
      localStorage.setItem('weekMoods', JSON.stringify(next))
      return next
    })
    setPicker(null)
  }

  return (
    <div className="weekbar-wrap">
      <div className="weekbar-holder" />
      <div className="week-bar">
        {days.map((d, i) => {
          const key = d.toDateString()
          const isToday = key === today
          const mood = moods[key] || 0
          return (
            <div key={i} className={`week-day${isToday ? ' today' : ''}`}>
              <span className="wd-name">{DAY_NAMES[i]}</span>
              <span className="wd-date">{d.getDate()}</span>
              <button
                className={`mood-dot${mood ? ' filled' : ''}`}
                onClick={() => cycleMood(key)}
                title="点击切换心情"
              >
                {mood ? MOODS[mood] : ''}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
