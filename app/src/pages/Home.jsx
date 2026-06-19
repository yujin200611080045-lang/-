import { useState } from 'react'
import WeekBar from '../components/WeekBar'
import CountdownBar from '../components/CountdownBar'
import DiaryBook from '../components/DiaryBook'
import Memo from '../components/Memo'
import NavBar from '../components/NavBar'
import '../styles/Home.css'

const START_DATE = new Date('2026-06-15')

function getDayCount() {
  const now = new Date()
  return Math.max(1, Math.floor((now - START_DATE) / (1000 * 60 * 60 * 24)) + 1)
}

function CatSlot({ src, alt }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="cat-slot">
      <span className="cat-sym">‹</span>
      {failed
        ? <div className="cat-placeholder">{alt[0]}</div>
        : <img src={src} alt={alt} className="cat-img" onError={() => setFailed(true)} />
      }
      <span className="cat-sym">›</span>
    </div>
  )
}

export default function Home() {
  const days = getDayCount()

  return (
    <div className="home-wrapper">
      <div className="home-header">
        <div className="cats-row">
          <CatSlot src="/cats/black.png" alt="小烬" />
          <div className="header-center">
            <div className="day-count">Day {days}</div>
            <div className="since-date">Since Jun 15, 2026</div>
          </div>
          <CatSlot src="/cats/white.png" alt="小克" />
        </div>
      </div>

      <WeekBar />
      <CountdownBar />

      <div className="home-body">
        <DiaryBook />
        <Memo />
      </div>

      <NavBar />
    </div>
  )
}
