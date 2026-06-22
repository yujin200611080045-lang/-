import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import '../styles/FloatingBar.css'

const BAR_W = 224
const MINI_W = 52
const SNAP_MARGIN = 12
const SNAP_BOTTOM = 90

export default function FloatingBar() {
  const location = useLocation()
  const isListen = location.pathname === '/listen'

  const [ms, setMs] = useState(() => window.__musicState || null)
  const [mini, setMini] = useState(false)
  // corner: null=初始横跨顶部 | { side:'left'|'right', vert:'top'|'bottom' }
  const [corner, setCorner] = useState(null)
  const [dragPos, setDragPos] = useState(null)

  const wrapRef = useRef(null)
  const dragInfo = useRef(null)
  const dragPosRef = useRef(null) // 同步 dragPos 给 touchend 读取
  const miniRef = useRef(mini)

  useEffect(() => { miniRef.current = mini }, [mini])
  useEffect(() => { dragPosRef.current = dragPos }, [dragPos])

  useEffect(() => {
    const handler = () => setMs(window.__musicState ? { ...window.__musicState } : null)
    window.addEventListener('music:statechange', handler)
    return () => window.removeEventListener('music:statechange', handler)
  }, [])

  // non-passive touchmove，允许 preventDefault 阻止页面滚动
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    function handleMove(e) {
      if (!dragInfo.current) return
      e.preventDefault()
      const touch = e.touches[0]
      const dx = touch.clientX - dragInfo.current.startTouchX
      const dy = touch.clientY - dragInfo.current.startTouchY
      const pos = {
        x: dragInfo.current.startElemX + dx,
        y: dragInfo.current.startElemY + dy,
      }
      dragPosRef.current = pos
      setDragPos(pos)
    }
    wrap.addEventListener('touchmove', handleMove, { passive: false })
    return () => wrap.removeEventListener('touchmove', handleMove)
  })

  const visible = !isListen && ms?.track
  if (!visible) return null

  const { track, playing, curLyric, lyrics } = ms
  const lyricText = lyrics[curLyric]?.text || ''

  function onTouchStart(e) {
    if (e.target.closest('.fb-btn') || e.target.closest('.fb-cover')) return
    const touch = e.touches[0]
    const rect = wrapRef.current.getBoundingClientRect()
    dragInfo.current = {
      startTouchX: touch.clientX,
      startTouchY: touch.clientY,
      startElemX: rect.left,
      startElemY: rect.top,
    }
  }

  function onTouchEnd() {
    if (!dragInfo.current) return
    const pos = dragPosRef.current || {
      x: dragInfo.current.startElemX,
      y: dragInfo.current.startElemY,
    }
    const vw = window.innerWidth
    const vh = window.innerHeight
    const w = miniRef.current ? MINI_W : BAR_W
    const centerX = pos.x + w / 2
    const centerY = pos.y + 27
    setCorner({
      side: centerX < vw / 2 ? 'left' : 'right',
      vert: centerY < vh / 2 ? 'top' : 'bottom',
    })
    setDragPos(null)
    dragPosRef.current = null
    dragInfo.current = null
  }

  // 计算 inline style
  function buildStyle() {
    const w = mini ? MINI_W : BAR_W
    if (dragPos) {
      return { left: `${dragPos.x}px`, top: `${dragPos.y}px`, width: `${w}px`, right: 'auto', bottom: 'auto', transition: 'none' }
    }
    if (corner) {
      return {
        [corner.side === 'left' ? 'left' : 'right']: `${SNAP_MARGIN}px`,
        [corner.side === 'left' ? 'right' : 'left']: 'auto',
        [corner.vert === 'top' ? 'top' : 'bottom']: corner.vert === 'top' ? 'calc(env(safe-area-inset-top, 0px) + 8px)' : `${SNAP_BOTTOM}px`,
        [corner.vert === 'top' ? 'bottom' : 'top']: 'auto',
        width: `${w}px`,
      }
    }
    // 初始横跨
    return {}
  }

  return (
    <div
      ref={wrapRef}
      className={`fb-wrap${mini ? ' fb-mini' : ''}${corner ? ' fb-snapped' : ''}`}
      style={buildStyle()}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
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
          <button className="fb-btn" onClick={() => window.dispatchEvent(new CustomEvent('music:toggle'))}>
            {playing
              ? <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            }
          </button>
          <button className="fb-btn" onClick={() => window.dispatchEvent(new CustomEvent('music:next'))}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 5l10 7-10 7V5z"/><line x1="19" y1="5" x2="19" y2="19"/>
            </svg>
          </button>
        </>
      )}
    </div>
  )
}
