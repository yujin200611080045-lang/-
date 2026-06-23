import { useState, useRef } from 'react'
import NavBar from '../components/NavBar'
import '../styles/Have.css'
import '../styles/Companion.css'

export default function Companion() {
  const [mode, setMode] = useState('docked') // 'docked' | 'floating'
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const wrapperRef = useRef(null)
  const posRef = useRef({ x: 0, y: 0 })
  const dragOffset = useRef({ x: 0, y: 0 })
  const draggingRef = useRef(false)

  function enterFloat() {
    const rect = wrapperRef.current.getBoundingClientRect()
    const x = rect.left + (rect.width - 80) / 2
    const y = rect.top
    posRef.current = { x, y }
    setPos({ x, y })
    setMode('floating')
  }

  function onPointerDown(e) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragOffset.current = {
      x: e.clientX - posRef.current.x,
      y: e.clientY - posRef.current.y,
    }
    draggingRef.current = true
    setDragging(true)
  }

  function onPointerMove(e) {
    if (!draggingRef.current) return
    const x = e.clientX - dragOffset.current.x
    const y = e.clientY - dragOffset.current.y
    posRef.current = { x, y }
    setPos({ x, y })
  }

  function onPointerUp() {
    draggingRef.current = false
    setDragging(false)
  }

  return (
    <div className="companion-page">
      {mode === 'docked' && (
        <div className="puddle-scene" onClick={enterFloat}>
          <div className="puddle-back" />
          <div className="chibi-wrapper" ref={wrapperRef}>
            <img
              src="/chibi-have.png"
              className="chibi-char peeking"
              alt=""
              draggable={false}
            />
          </div>
          <div className="puddle-front">
            <div className="puddle-rim" />
          </div>
        </div>
      )}

      {mode === 'floating' && (
        <img
          src="/chibi-have.png"
          className={`chibi-float${dragging ? ' grabbing' : ''}`}
          style={{ left: pos.x, top: pos.y }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          draggable={false}
          alt=""
        />
      )}

      <NavBar />
    </div>
  )
}
