import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import NavBar from '../components/NavBar'
import '../styles/Listen.css'

const API = import.meta.env.VITE_NC_API || ''

function getCookie() { return localStorage.getItem('nc_cookie') || '' }
function saveCookie(c) { localStorage.setItem('nc_cookie', c) }
function clearCookie() { localStorage.removeItem('nc_cookie') }

function req(path, params = {}) {
  const cookie = getCookie()
  const p = new URLSearchParams({ ...params, timestamp: Date.now(), ...(cookie ? { cookie } : {}) })
  return fetch(`${API}${path}?${p}`).then(r => r.json())
}

function parseLrc(str) {
  if (!str) return []
  return str.split('\n')
    .map(line => {
      const m = line.match(/\[(\d+):(\d+\.?\d*)\](.*)/)
      if (!m) return null
      return { time: +m[1] * 60 + +m[2], text: m[3].trim() }
    })
    .filter(l => l && l.text)
    .sort((a, b) => a.time - b.time)
}

export default function Listen() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState('init') // init | qr | playing
  const [qrImg, setQrImg] = useState('')
  const [qrExpired, setQrExpired] = useState(false)
  const [track, setTrack] = useState(null)
  const [lyrics, setLyrics] = useState([])
  const [curLyric, setCurLyric] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [playlist, setPlaylist] = useState([])
  const [playIdx, setPlayIdx] = useState(0)
  const [loading, setLoading] = useState(false)

  const audioRef = useRef(null)
  const lyricBoxRef = useRef(null)
  const pollRef = useRef(null)
  const qrKeyRef = useRef('')

  useEffect(() => {
    if (!API) { setPhase('no-api'); return }
    if (getCookie()) {
      req('/user/account').then(res => {
        if (res.code === 200) {
          setPhase('playing')
          loadFavorites(res.account.id)
        } else {
          clearCookie()
          startQr()
        }
      }).catch(() => startQr())
    } else {
      startQr()
    }
    return () => clearInterval(pollRef.current)
  }, [])

  async function startQr() {
    setPhase('qr')
    setQrExpired(false)
    try {
      const { data: { unikey } } = await req('/login/qr/key')
      qrKeyRef.current = unikey
      const { data: { qrimg } } = await req('/login/qr/create', { key: unikey, qrimg: 1 })
      setQrImg(qrimg)
      clearInterval(pollRef.current)
      pollRef.current = setInterval(() => pollQr(unikey), 2000)
    } catch (e) {
      console.error('QR init failed', e)
    }
  }

  async function pollQr(key) {
    try {
      const res = await req('/login/qr/check', { key })
      if (res.code === 803) {
        clearInterval(pollRef.current)
        saveCookie(res.cookie)
        const { account } = await req('/user/account')
        setPhase('playing')
        loadFavorites(account.id)
      } else if (res.code === 800) {
        clearInterval(pollRef.current)
        setQrExpired(true)
      }
    } catch (e) {}
  }

  async function loadFavorites(uid) {
    setLoading(true)
    try {
      const { playlist: lists } = await req('/user/playlist', { uid })
      if (!lists?.length) return
      const favId = lists[0].id
      const { songs } = await req('/playlist/track/all', { id: favId, limit: 100 })
      if (songs?.length) {
        setPlaylist(songs)
        await loadTrack(songs[0], 0)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function loadTrack(song, idx) {
    setPlayIdx(idx)
    setLyrics([])
    setCurLyric(0)
    setProgress(0)
    setTrack({
      id: song.id,
      name: song.name,
      artist: song.ar?.map(a => a.name).join(' / ') || '',
      albumArt: song.al?.picUrl || '',
    })

    try {
      const [urlRes, lrcRes] = await Promise.all([
        req('/song/url', { id: song.id }),
        req('/lyric', { id: song.id }),
      ])
      const url = urlRes.data?.[0]?.url
      if (url && audioRef.current) {
        audioRef.current.src = url
        audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
      }
      const lrcStr = lrcRes.lrc?.lyric || ''
      setLyrics(parseLrc(lrcStr))
    } catch (e) {
      console.error(e)
    }
  }

  function handleTimeUpdate() {
    const a = audioRef.current
    if (!a || !a.duration) return
    const t = a.currentTime
    setProgress(t / a.duration)

    let idx = 0
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= t) idx = i
      else break
    }
    setCurLyric(idx)
  }

  useEffect(() => {
    if (!lyricBoxRef.current || !lyrics.length) return
    const el = lyricBoxRef.current.querySelectorAll('.lyric-line')[curLyric]
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [curLyric, lyrics.length])

  function togglePlay() {
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause(); setPlaying(false) }
    else { a.play(); setPlaying(true) }
  }

  function skipTo(delta) {
    if (!playlist.length) return
    const idx = (playIdx + delta + playlist.length) % playlist.length
    loadTrack(playlist[idx], idx)
  }

  function seek(e) {
    const a = audioRef.current
    if (!a || !a.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    a.currentTime = ((e.clientX - rect.left) / rect.width) * a.duration
  }

  return (
    <div className="listen-page">
      <div className="listen-header">
        <button className="listen-back" onClick={() => navigate('/')}>‹</button>
        <span className="listen-title">一起听</span>
        <div className="listen-header-gap" />
      </div>

      {phase === 'no-api' && (
        <div className="listen-empty">
          <p className="empty-hint">还没配置 API</p>
          <p className="empty-sub">在 Vercel 里设置 VITE_NC_API 环境变量后刷新</p>
        </div>
      )}

      {phase === 'qr' && (
        <div className="listen-qr">
          {qrExpired ? (
            <div className="qr-expired" onClick={startQr}>
              <span>二维码过期了</span>
              <span className="qr-refresh">点击刷新</span>
            </div>
          ) : (
            qrImg && <img src={qrImg} className="qr-img" alt="扫码登录" />
          )}
          <p className="qr-hint">扫码登录网易云</p>
          <p className="qr-sub">登录后就能一起听了</p>
        </div>
      )}

      {phase === 'playing' && (
        <div className="listen-body">
          <div className="listen-cover-wrap">
            <div className={`listen-cover${playing ? ' spinning' : ''}`}>
              {track?.albumArt
                ? <img src={track.albumArt} alt="" />
                : <div className="cover-placeholder" />
              }
            </div>
          </div>

          <div className="listen-info">
            {loading
              ? <div className="listen-loading">加载中…</div>
              : <>
                  <div className="listen-name">{track?.name || '—'}</div>
                  <div className="listen-artist">{track?.artist || ''}</div>
                </>
            }
          </div>

          <div className="listen-progress-wrap" onClick={seek}>
            <div className="listen-progress-bar">
              <div className="listen-progress-fill" style={{ width: `${progress * 100}%` }} />
              <div className="listen-progress-dot" style={{ left: `${progress * 100}%` }} />
            </div>
          </div>

          <div className="listen-controls">
            <button className="ctrl-btn" onClick={() => skipTo(-1)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M19 5L9 12l10 7V5z"/><line x1="5" y1="5" x2="5" y2="19"/>
              </svg>
            </button>
            <button className="ctrl-btn play-btn" onClick={togglePlay}>
              {playing
                ? <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                : <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              }
            </button>
            <button className="ctrl-btn" onClick={() => skipTo(1)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M5 5l10 7-10 7V5z"/><line x1="19" y1="5" x2="19" y2="19"/>
              </svg>
            </button>
          </div>

          <div className="listen-lyrics" ref={lyricBoxRef}>
            {lyrics.length > 0
              ? lyrics.map((l, i) => (
                  <p key={i} className={`lyric-line${i === curLyric ? ' active' : ''}`}>
                    {l.text}
                  </p>
                ))
              : <p className="lyric-empty">暂无歌词</p>
            }
          </div>
        </div>
      )}

      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => skipTo(1)}
      />
      <NavBar />
    </div>
  )
}
