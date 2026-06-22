import { Routes, Route, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Chat from './pages/Chat'
import Diary from './pages/Diary'
import Calendar from './pages/Calendar'
import Listen from './pages/Listen'
import Books from './pages/Books'
import FloatingBar from './components/FloatingBar'

export default function App() {
  const location = useLocation()
  const isListen = location.pathname === '/listen'

  return (
    <>
      <FloatingBar />

      {/* Listen stays mounted across navigations — never unmounts */}
      <div style={{
        display: isListen ? 'flex' : 'none',
        flexDirection: 'column',
        height: '100dvh',
        width: '100%',
      }}>
        <Listen />
      </div>

      {!isListen && (
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/diary" element={<Diary />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/books" element={<Books />} />
        </Routes>
      )}
    </>
  )
}
