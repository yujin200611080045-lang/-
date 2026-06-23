import { useState } from 'react'
import NavBar from '../components/NavBar'
import '../styles/Have.css'

export default function Have() {
  const [peeking, setPeeking] = useState(false)
  const [rippleKey, setRippleKey] = useState(0)

  function handleTap() {
    setPeeking(v => !v)
    setRippleKey(k => k + 1)
  }

  return (
    <div className="have-page">
      <div className="puddle-scene" onClick={handleTap}>

        {/* full ellipse — dark water behind character */}
        <div className="puddle-back" />

        {/*
          wrapper bottom = puddle midline (water surface).
          overflow:hidden clips character when translateY(100%) pushes it below.
        */}
        <div className="chibi-wrapper">
          <img
            src="/chibi-have.png"
            className={`chibi-char${peeking ? ' peeking' : ''}`}
            alt=""
            draggable={false}
          />
        </div>

        {/* ripple rings restart on every tap */}
        {[0, 170, 340].map(delay => (
          <div
            key={`${rippleKey}-${delay}`}
            className="ripple-ring"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}

        {/* bottom-half ellipse — covers water depth, z-index above character */}
        <div className="puddle-front">
          <div className="puddle-rim" />
        </div>

      </div>

      <NavBar />
    </div>
  )
}
