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

        {/* Back of puddle — behind the character */}
        <div className="puddle-back">
          <div className="puddle-sheen" />
        </div>

        {/* Ripple rings — keyed so they restart on every tap */}
        {[0, 170, 340].map(delay => (
          <div
            key={`${rippleKey}-${delay}`}
            className="ripple-ring"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}

        {/* Character — sandwiched between puddle layers */}
        <img
          src="/chibi-have.png"
          className={`chibi-char${peeking ? ' peeking' : ''}`}
          alt=""
          draggable={false}
        />

        {/* Front puddle surface — covers lower body of character */}
        <div className="puddle-front">
          <div className="puddle-rim" />
        </div>

      </div>

      <NavBar />
    </div>
  )
}
