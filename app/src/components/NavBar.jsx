import { useNavigate, useLocation } from 'react-router-dom'
import '../styles/NavBar.css'

const TABS = [
  { word: 'If',    path: '/' },
  { word: 'we',    path: '/chat' },
  { word: 'have',  path: '/diary' },
  { word: 'each',  path: '/each' },
  { word: 'other', path: '/settings' },
]

export default function NavBar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <nav className="navbar">
      {TABS.map(tab => (
        <button
          key={tab.word}
          className={`nav-item${pathname === tab.path ? ' active' : ''}`}
          onClick={() => navigate(tab.path)}
        >
          {tab.word}
        </button>
      ))}
    </nav>
  )
}
