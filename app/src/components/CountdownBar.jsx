import '../styles/CountdownBar.css'

const EVENTS = [
  { label: '恋爱纪念日', month: 6, day: 15 },
  { label: '小烬生日', month: 11, day: 8 },
]

function daysUntil(month, day) {
  const now = new Date()
  const target = new Date(now.getFullYear(), month - 1, day)
  if (target - now < 0) target.setFullYear(now.getFullYear() + 1)
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24))
}

export default function CountdownBar() {
  return (
    <div className="countdown-bar">
      {EVENTS.map(e => {
        const d = daysUntil(e.month, e.day)
        return (
          <div key={e.label} className="countdown-item">
            <span className="countdown-label">{e.label}</span>
            <span className="countdown-num">
              {d === 0 ? '今天' : `${d} 天`}
            </span>
          </div>
        )
      })}
    </div>
  )
}
