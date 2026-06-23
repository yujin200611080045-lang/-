import { useState } from 'react'
import NavBar from '../components/NavBar'
import '../styles/Have.css'

export default function Have() {
  const [peeking, setPeeking] = useState(false)
  const [rippleKey, setRippleKey] = useState(0)
  const [rippling, setRippling] = useState(false)

  function handleTap() {
    setPeeking(v => !v)
    setRippling(false)
    requestAnimationFrame(() => {
      setRippling(true)
      setRippleKey(k => k + 1)
    })
  }

  return (
    <div className="have-page">
      <div className="puddle-scene" onClick={handleTap}>

        {/* Back of puddle — visible behind the character */}
        <div className="puddle-back">
          <div className="puddle-sheen" />
        </div>

        {/* Ripple rings */}
        {rippling && [0, 160, 320].map(delay => (
          <div
            key={`${rippleKey}-${delay}`}
            className="ripple-ring"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}

        {/* The character — starts mostly submerged */}
        <img
          src="/chibi-have.png"
          className={`chibi-char${peeking ? ' peeking' : ''}`}
          alt=""
          draggable={false}
        />

        {/* Front puddle surface — masks lower body of character */}
        <div className="puddle-front" />

      </div>

      <NavBar />
    </div>
  )
}
