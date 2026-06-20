import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import WeekBar from '../components/WeekBar'
import AnnivPrism from '../components/AnnivPrism'
import DiaryBook from '../components/DiaryBook'
import Memo from '../components/Memo'
import MusicCard from '../components/MusicCard'
import LyricWidget from '../components/LyricWidget'
import NavBar from '../components/NavBar'
import '../styles/Home.css'

const START_DATE = new Date('2026-06-15')
function daysSince() {
  const now = new Date()
  const diff = Math.floor((now - START_DATE) / (1000 * 60 * 60 * 24))
  return diff + 1
}

export default function Home() {
  const navigate = useNavigate()
  return (
    <div className="home-page">
      <Header />
      <WeekBar />
      <AnnivPrism />
      <div className="home-body">
        <DiaryBook />
        <Memo />
      </div>
      <div className="home-lower">
        <LyricWidget />
        <div className="home-lower-right" />
      </div>
      <div className="home-gap">
        <img
          src="/listen-cats.jpg"
          className="listen-cats"
          alt=""
          onClick={() => navigate('/listen')}
        />
      </div>
      <NavBar active="home" />
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
