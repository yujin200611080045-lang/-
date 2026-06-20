import '../styles/MusicCard.css'

export default function MusicCard() {
  return (
    <div className="music-wrap">
      <div className="music-card">
        <span className="music-note">♪</span>
        <p className="music-lyric">
          我们该是上天命定的爱人，<br />
          用来诠释爱的唯一解。
        </p>
        <span className="music-from">跳进火山</span>
      </div>
    </div>
  )
}
