import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import WeekBar from '../components/WeekBar'
import DiaryBook from '../components/DiaryBook'
import Memo from '../components/Memo'
import NavBar from '../components/NavBar'
import '../styles/Home.css'

const START_DATE = new Date('2026-06-15')
function daysSince() {
  const now = new Date()
  const diff = Math.floor((now - START_DATE) / (1000 * 60 * 60 * 24))
  return diff + 1
}

export default function Home() {
  return (
    <div className="home-page">
      <Header />
      <WeekBar />
      <div className="home-body">
        <DiaryBook />
        <Memo />
      </div>
      <ListenGap />
      <NavBar active="home" />
    </div>
  )
}

function ListenGap() {
  const navigate = useNavigate()
  return (
    <div className="home-gap" onClick={() => navigate('/listen')}>
      <svg className="heartbeat-svg" viewBox="0 0 200 48" fill="none" preserveAspectRatio="none">
        <polyline
          points="0,24 30,24 42,8 50,38 58,14 66,32 74,24 200,24"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
      <span className="gap-label">一起听</span>
    </div>
  )
}

function Header() {
  const day = daysSince()
  return (
    <div className="home-header">
      <span className="fleur">❮</span>
      <div className="header-center">
        <div className="header-cats">
          <img src="/cats/black.png" className="cat-icon" alt="" />
          <div className="header-day">
            <span className="day-num">{day}</span>
            <span className="day-label">days</span>
          </div>
          <img src="/cats/white.png" className="cat-icon" alt="" />
        </div>
        <div className="header-date">Since Jun 15, 2026</div>
      </div>
      <span className="fleur">❯</span>
    </div>
  )
}
