import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import '../styles/FloatingBar.css'

const SNAP_MARGIN = 12
const BAR_HEIGHT = 54
const MINI_SIZE = 52
const DRAG_THRESHOLD = 5

function getSafeAreaBottom() {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')) || 0
}

export default function FloatingBar() {
  const location = useLocation()
  const isListen = location.pathname === '/listen'

  const [ms, setMs] = useState(() => window.__musicState || null)
  const [mini, setMini] = useState(false)
  const [dragPos, setDragPos] = useState(null)
  const [barY, setBarY] = useState(null)       // null = 顶部默认
  const [miniPos, setMiniPos] = useState(null)  // null = 右上默认

  const wrapRef = useRef(null)
  const dragInfo = useRef(null)
  const dragPosRef = useRef(null)
  const miniRef = useRef(mini)

  useEffect(() => { miniRef.current = mini }, [mini])

  useEffect(() => {
    const handler = () => setMs(window.__musicState ? { ...window.__musicState } : null)
    window.addEventListener('music:statechange', handler)
    return () => window.removeEventListener('music:statechange', handler)
  }, [])

  // non-passive touchmove，区分拖动与点击
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    function handleMove(e) {
      if (!dragInfo.current) return
      const touch = e.touches[0]
      const dx = touch.clientX - dragInfo.current.startTouchX
      const dy = touch.clientY - dragInfo.current.startTouchY
      if (!dragInfo.current.isDrag) {
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
          dragInfo.current.isDrag = true
        } else {
          return
        }
      }
      e.preventDefault()
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

  // 在 listen 页内暂停后离开 → 隐藏；在悬浮条上暂停 → 继续显示
  const visible = !isListen && ms?.track && (ms?.playing || !ms?.pausedInListen)
  if (!visible) return null

  const { track, playing, curLyric, lyrics } = ms
  const lyricText = lyrics[curLyric]?.text || ''

  function onTouchStart(e) {
    const touch = e.touches[0]
    const rect = wrapRef.current.getBoundingClientRect()
    dragInfo.current = {
      startTouchX: touch.clientX,
      startTouchY: touch.clientY,
      startElemX: rect.left,
      startElemY: rect.top,
      isDrag: false,
      target: e.target,
    }
  }

  function onTouchEnd() {
    if (!dragInfo.current) return

    if (!dragInfo.current.isDrag) {
      // 点击：cover点击切换mini，mini模式下点任意位置切换
      if (miniRef.current || dragInfo.current.target.closest('.fb-cover')) {
        setMini(m => !m)
      }
      dragInfo.current = null
      setDragPos(null)
      dragPosRef.current = null
      return
    }

    const pos = dragPosRef.current || {
      x: dragInfo.current.startElemX,
      y: dragInfo.current.startElemY,
    }
    const vw = window.innerWidth
    const vh = window.innerHeight

    const sab = getSafeAreaBottom()
    if (miniRef.current) {
      // mini 圆：左右吸附，Y 自由
      const side = (pos.x + MINI_SIZE / 2) < vw / 2 ? 'left' : 'right'
      const y = Math.max(8, Math.min(pos.y, vh - MINI_SIZE - sab - 8))
      setMiniPos({ side, y })
    } else {
      // 全宽条：只改 Y，宽度不变
      const y = Math.max(8, Math.min(pos.y, vh - BAR_HEIGHT - sab - 8))
      setBarY(y)
    }

    setDragPos(null)
    dragPosRef.current = null
    dragInfo.current = null
  }

  function buildStyle() {
    if (mini) {
      const base = {
        width: `${MINI_SIZE}px`,
        height: `${MINI_SIZE}px`,
        borderRadius: '50%',
        padding: '4px',
        bottom: 'auto',
        justifyContent: 'center',
        boxShadow: '0 0 16px rgba(0, 0, 0, 0.4)',
      }
      if (dragPos) {
        return { ...base, left: `${dragPos.x}px`, top: `${dragPos.y}px`, right: 'auto', transition: 'none' }
      }
      if (miniPos) {
        return {
          ...base,
          [miniPos.side === 'left' ? 'left' : 'right']: `${SNAP_MARGIN}px`,
          [miniPos.side === 'left' ? 'right' : 'left']: 'auto',
          top: `${miniPos.y}px`,
        }
      }
      // 默认右上
      return { ...base, right: `${SNAP_MARGIN}px`, left: 'auto', top: 'calc(env(safe-area-inset-top, 0px) + 8px)' }
    }

    // 全宽条
    if (dragPos) {
      return { left: `${SNAP_MARGIN}px`, right: `${SNAP_MARGIN}px`, top: `${dragPos.y}px`, bottom: 'auto', transition: 'none' }
    }
    if (barY !== null) {
      return { left: `${SNAP_MARGIN}px`, right: `${SNAP_MARGIN}px`, top: `${barY}px`, bottom: 'auto' }
    }
    return {}
  }

  return (
    <div
      ref={wrapRef}
      className="fb-wrap"
      style={buildStyle()}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="fb-cover">
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
          <button className="fb-btn" onClick={() => {
            if (playing) window.__pausedFromFloatingBar = true
            window.dispatchEvent(new CustomEvent('music:toggle'))
          }}>
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
