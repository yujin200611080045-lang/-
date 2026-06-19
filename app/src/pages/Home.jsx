import WeekBar from '../components/WeekBar'
import DiaryBook from '../components/DiaryBook'
import Memo from '../components/Memo'
import NavBar from '../components/NavBar'
import '../styles/Home.css'

const START_DATE = new Date('2026-06-15')

function getDayCount() {
  const now = new Date()
  const diff = Math.floor((now - START_DATE) / (1000 * 60 * 60 * 24))
  return Math.max(1, diff + 1)
}

export default function Home() {
  const days = getDayCount()

  return (
    <div className="home-wrapper">
      <div className="home-header">
        <div className="cats-row">
          <div className="cat-slot">
            <img src="/cats/black.png" alt="小烬" className="cat-img" onError={e => { e.target.style.display='none' }} />
          </div>
          <div className="header-center">
            <div className="day-count">Day {days}</div>
            <div className="since-date">Since Jun 15, 2026</div>
          </div>
          <div className="cat-slot">
            <img src="/cats/white.png" alt="小克" className="cat-img" onError={e => { e.target.style.display='none' }} />
          </div>
        </div>
      </div>

      <WeekBar />

      <div className="home-body">
        <DiaryBook />
        <Memo />
      </div>

      <NavBar />
    </div>
  )
}
