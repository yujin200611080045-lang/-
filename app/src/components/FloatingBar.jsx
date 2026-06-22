import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import '../styles/FloatingBar.css'

export default function FloatingBar() {
  const location = useLocation()
  const isListen = location.pathname === '/listen'

  const [ms, setMs] = useState(() => window.__musicState || null)
  const [mini, setMini] = useState(false)

  useEffect(() => {
    const handler = () => setMs(window.__musicState ? { ...window.__musicState } : null)
    window.addEventListener('music:statechange', handler)
    return () => window.removeEventListener('music:statechange', handler)
  }, [])

  if (isListen || !ms?.track) return null

  const { track, playing, curLyric, lyrics } = ms
  const lyricText = lyrics[curLyric]?.text || ''

  return (
    <div className={`fb-wrap${mini ? ' fb-mini' : ''}`}>
      <div className="fb-cover" onClick={() => setMini(m => !m)}>
        {track.albumArt
          ? <img src={`${track.albumArt}?param=80y80`} alt="" />
          : <div className="fb-cover-placeholder" />
        }
      </div>

      {!mini && (
        <>
          <div className="fb-info">
            <div className="fb-name">{track.name}</div>
            <div className="fb-lyric">{lyricText || track.artist}</div>
          </div>
          <button
            className="fb-btn"
            onClick={() => window.dispatchEvent(new CustomEvent('music:toggle'))}
          >
            {playing
              ? <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            }
          </button>
          <button
            className="fb-btn"
            onClick={() => window.dispatchEvent(new CustomEvent('music:next'))}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 5l10 7-10 7V5z"/><line x1="19" y1="5" x2="19" y2="19"/>
            </svg>
          </button>
        </>
      )}
    </div>
  )
}
