import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Chat from './pages/Chat'
import Diary from './pages/Diary'
import Calendar from './pages/Calendar'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/chat" element={<Chat />} />
      <Route path="/diary" element={<Diary />} />
      <Route path="/calendar" element={<Calendar />} />
    </Routes>
  )
}
