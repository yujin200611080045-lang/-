import { Routes, Route, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Chat from './pages/Chat'
import Diary from './pages/Diary'
import Calendar from './pages/Calendar'
import Listen from './pages/Listen'
import Books from './pages/Books'
import Settings from './pages/Settings'
import Have from './pages/Have'
import Companion from './pages/Companion'
import FloatingBar from './components/FloatingBar'

export default function App() {
  const location = useLocation()
  const isListen = location.pathname === '/listen'
  const isHave = location.pathname === '/have'
  const isCompanion = location.pathname === '/companion'
  const inHaveFlow = isHave || isCompanion

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

      {/*
        Have + Companion stay mounted together during the have/companion flow.
        Crossfade via opacity keeps the puddle/chibi seamless — no DOM swap, no flash.
        position:fixed wrappers cover the full viewport so inner fixed elements
        (topbar, inputbar, puddle-overlay) all resolve to viewport coords correctly.
      */}
      {!isListen && inHaveFlow && (
        <>
          <div style={{
            position: 'fixed',
            top: 0, left: 0, width: '100%', height: '100dvh',
            zIndex: 1,
            opacity: isHave ? 1 : 0,
            pointerEvents: isHave ? 'auto' : 'none',
            transition: 'opacity 0.2s ease',
          }}>
            <Have />
          </div>
          <div style={{
            position: 'fixed',
            top: 0, left: 0, width: '100%', height: '100dvh',
            zIndex: 2,
            opacity: isCompanion ? 1 : 0,
            pointerEvents: isCompanion ? 'auto' : 'none',
            transition: 'opacity 0.2s ease',
          }}>
            <Companion />
          </div>
        </>
      )}

      {!isListen && !inHaveFlow && (
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/diary" element={<Diary />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/books" element={<Books />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      )}
    </>
  )
}
