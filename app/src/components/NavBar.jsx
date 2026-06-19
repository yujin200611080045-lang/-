import '../styles/NavBar.css'

const WORDS = ['If', 'we', 'have', 'each', 'other']

export default function NavBar() {
  return (
    <nav className="navbar">
      {WORDS.map(w => (
        <span key={w} className="nav-word">{w}</span>
      ))}
    </nav>
  )
}
