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

      <div className="chibi-anchor">
        <div className="chibi-swing">
          <svg width="18" height="76" viewBox="0 0 18 76" fill="none">
            <ellipse cx="9" cy="5"  rx="3.5" ry="3.5" stroke="#4a5156" strokeWidth="1.5"/>
            <ellipse cx="9" cy="16" rx="7"   ry="3.5" stroke="#808a92" strokeWidth="1.5"/>
            <ellipse cx="9" cy="27" rx="3.5" ry="7"   stroke="#4a5156" strokeWidth="1.5"/>
            <ellipse cx="9" cy="38" rx="7"   ry="3.5" stroke="#808a92" strokeWidth="1.5"/>
            <ellipse cx="9" cy="49" rx="3.5" ry="7"   stroke="#4a5156" strokeWidth="1.5"/>
            <ellipse cx="9" cy="60" rx="7"   ry="3.5" stroke="#808a92" strokeWidth="1.5"/>
            <ellipse cx="9" cy="71" rx="3.5" ry="7"   stroke="#4a5156" strokeWidth="1.5"/>
          </svg>
          <img src="/chibi.png" className="chibi-img" alt="" />
        </div>
      </div>
    </div>
  )
}
