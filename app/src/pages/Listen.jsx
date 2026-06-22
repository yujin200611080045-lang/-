import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/Listen.css'

const API = import.meta.env.VITE_NC_API || 'https://neteasecloudmusicapi-zm28.onrender.com'

function getCookie() { return localStorage.getItem('nc_cookie') || '' }
function saveCookie(c) { localStorage.setItem('nc_cookie', c) }
function clearCookie() {
  localStorage.removeItem('nc_cookie')
  localStorage.removeItem('listen_cache')
}

function readCache() {
  try { return JSON.parse(localStorage.getItem('listen_cache') || 'null') } catch { return null }
}
function saveCache(patch) {
  try {
    const prev = readCache() || {}
    localStorage.setItem('listen_cache', JSON.stringify({ ...prev, ...patch }))
  } catch {}
}

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

  // Read cache once on mount
  const [cached] = useState(readCache)

  const [phase, setPhase] = useState(() =>
    getCookie() && cached?.playlist?.length ? 'playing' : 'init'
  )
  const [qrImg, setQrImg] = useState('')
  const [qrExpired, setQrExpired] = useState(false)
  const [qrLoading, setQrLoading] = useState(false)

  const [track, setTrack] = useState(() => cached?.track || null)
  const [lyrics, setLyrics] = useState([])
  const [curLyric, setCurLyric] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [playlist, setPlaylist] = useState(() => cached?.playlist || [])
  const [playIdx, setPlayIdx] = useState(() => cached?.playIdx || 0)
  const [loading, setLoading] = useState(false)

  const [uid, setUid] = useState(() => cached?.uid || null)
  const [userProfile, setUserProfile] = useState(() => cached?.userProfile || null)
  const [allPlaylists, setAllPlaylists] = useState(() => cached?.allPlaylists || [])
  const [recommendations, setRecommendations] = useState(() => cached?.recommendations || [])
  const [recoIdx, setRecoIdx] = useState(() => {
    const recs = cached?.recommendations || []
    return Math.min(2, Math.max(0, recs.length - 1))
  })

  // 'player' | 'me'
  const [listenTab, setListenTab] = useState('player')

  const [thornSpin, setThornSpin] = useState(false)
  const [playMode, setPlayMode] = useState('sequential')
  const [showModeMenu, setShowModeMenu] = useState(false)
  const [showAiDialog, setShowAiDialog] = useState(false)
  const [sheet, setSheet] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)

  const audioRef = useRef(null)
  const lyricBoxRef = useRef(null)
  const pollRef = useRef(null)
  const searchTimer = useRef(null)
  const recoTouchX = useRef(null)
  const togglePlayRef = useRef(null)
  const skipToRef = useRef(null)

  useEffect(() => {
    if (!API) { setPhase('no-api'); return }
    if (getCookie()) {
      if (cached?.playlist?.length) {
        // Show cached data immediately, verify session + refresh in background
        setPhase('playing')
        req('/user/account').then(res => {
          if (res.code !== 200) { clearCookie(); startQr() }
        }).catch(() => {})
        loadRecommendations()
      } else {
        req('/user/account').then(res => {
          if (res.code === 200) {
            const profile = { avatarUrl: res.profile?.avatarUrl, nickname: res.profile?.nickname }
            setUid(res.account.id)
            setUserProfile(profile)
            saveCache({ uid: res.account.id, userProfile: profile })
            setPhase('playing')
            loadFavorites(res.account.id)
          } else {
            clearCookie()
            startQr()
          }
        }).catch(() => startQr())
      }
    } else {
      startQr()
    }
    return () => {
      clearInterval(pollRef.current)
      clearTimeout(searchTimer.current)
    }
  }, [])

  async function startQr() {
    setPhase('qr')
    setQrExpired(false)
    setQrImg('')
    setQrLoading(true)
    try {
      const { data: { unikey } } = await req('/login/qr/key')
      const { data: { qrimg } } = await req('/login/qr/create', { key: unikey, qrimg: 1 })
      setQrImg(qrimg)
      clearInterval(pollRef.current)
      pollRef.current = setInterval(() => pollQr(unikey), 2000)
    } catch (e) {
      console.error(e)
    } finally {
      setQrLoading(false)
    }
  }

  async function pollQr(key) {
    try {
      const res = await req('/login/qr/check', { key })
      if (res.code === 803) {
        clearInterval(pollRef.current)
        saveCookie(res.cookie)
        const acRes = await req('/user/account')
        setUid(acRes.account.id)
        setUserProfile({ avatarUrl: acRes.profile?.avatarUrl, nickname: acRes.profile?.nickname })
        setPhase('playing')
        loadFavorites(acRes.account.id)
      } else if (res.code === 800) {
        clearInterval(pollRef.current)
        setQrExpired(true)
      }
    } catch (e) {}
  }

  async function loadFavorites(uid) {
    setLoading(true)
    loadRecommendations()
    try {
      const { playlist: lists } = await req('/user/playlist', { uid })
      if (!lists?.length) return
      setAllPlaylists(lists)
      saveCache({ allPlaylists: lists })
      const { songs } = await req('/playlist/track/all', { id: lists[0].id, limit: 200 })
      if (songs?.length) {
        setPlaylist(songs)
        saveCache({ playlist: songs })
        await loadTrack(songs[0], 0, false)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function loadRecommendations() {
    try {
      const res = await req('/recommend/songs')
      if (res.code === 200 && res.data?.dailySongs?.length) {
        const songs = res.data.dailySongs.slice(0, 20)
        setRecommendations(songs)
        setRecoIdx(prev => recommendations.length ? prev : Math.min(2, songs.length - 1))
        saveCache({ recommendations: songs })
      }
    } catch (e) {}
  }

  async function switchPlaylist(pl) {
    setSheet(null)
    setListenTab('player')
    setLoading(true)
    try {
      const { songs } = await req('/playlist/track/all', { id: pl.id, limit: 200 })
      if (songs?.length) {
        setPlaylist(songs)
        saveCache({ playlist: songs })
        await loadTrack(songs[0], 0)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function loadTrack(song, idx, autoPlay = true) {
    setPlayIdx(idx)
    setLyrics([])
    setCurLyric(0)
    setProgress(0)
    const trackMeta = {
      id: song.id,
      name: song.name,
      artist: song.ar?.map(a => a.name).join(' / ') || '',
      albumArt: song.al?.picUrl || '',
    }
    setTrack(trackMeta)
    saveCache({ track: trackMeta, playIdx: idx })
    try {
      const [urlRes, lrcRes] = await Promise.all([
        req('/song/url', { id: song.id }),
        req('/lyric', { id: song.id }),
      ])
      const url = urlRes.data?.[0]?.url
      if (url && audioRef.current) {
        audioRef.current.src = url
        if (autoPlay) {
          audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
        }
      }
      setLyrics(parseLrc(lrcRes.lrc?.lyric || ''))
    } catch (e) {
      console.error(e)
    }
  }

  function playReco(song) {
    const idx = recommendations.findIndex(s => s.id === song.id)
    setPlaylist(recommendations)
    loadTrack(song, idx)
    setListenTab('player')
  }

  function handleTimeUpdate() {
    const a = audioRef.current
    if (!a || !a.duration) return
    setProgress(a.currentTime / a.duration)
    let idx = 0
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= a.currentTime) idx = i
      else break
    }
    setCurLyric(idx)
  }

  useEffect(() => {
    if (!lyricBoxRef.current || !lyrics.length) return
    const el = lyricBoxRef.current.querySelectorAll('.lyric-line')[curLyric]
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [curLyric, lyrics.length])

  // 广播播放状态供悬浮条使用
  useEffect(() => {
    window.__musicState = { track, playing, curLyric, lyrics }
    window.dispatchEvent(new CustomEvent('music:statechange'))
  }, [track, playing, curLyric, lyrics])

  // 保持最新函数引用，避免 stale closure
  useEffect(() => { togglePlayRef.current = togglePlay })
  useEffect(() => { skipToRef.current = skipTo })

  // 监听悬浮条发出的控制事件
  useEffect(() => {
    const onToggle = () => togglePlayRef.current?.()
    const onNext = () => skipToRef.current?.(1)
    const onPrev = () => skipToRef.current?.(-1)
    window.addEventListener('music:toggle', onToggle)
    window.addEventListener('music:next', onNext)
    window.addEventListener('music:prev', onPrev)
    return () => {
      window.removeEventListener('music:toggle', onToggle)
      window.removeEventListener('music:next', onNext)
      window.removeEventListener('music:prev', onPrev)
    }
  }, [])

  function togglePlay() {
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause(); setPlaying(false) }
    else { a.play(); setPlaying(true) }
  }

  function skipTo(delta) {
    if (!playlist.length) return
    let idx
    if (playMode === 'shuffle') {
      do { idx = Math.floor(Math.random() * playlist.length) }
      while (idx === playIdx && playlist.length > 1)
    } else {
      idx = (playIdx + delta + playlist.length) % playlist.length
    }
    loadTrack(playlist[idx], idx)
  }

  function seek(e) {
    const a = audioRef.current
    if (!a || !a.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    a.currentTime = ((e.clientX - rect.left) / rect.width) * a.duration
  }

  function handleSearch(q) {
    setSearchQuery(q)
    clearTimeout(searchTimer.current)
    if (!q.trim()) { setSearchResults([]); return }
    setSearching(true)
    searchTimer.current = setTimeout(() => execSearch(q), 500)
  }

  async function execSearch(q = searchQuery) {
    if (!q.trim()) return
    clearTimeout(searchTimer.current)
    setSearching(true)
    try {
      const res = await req('/search', { keywords: q, type: 1, limit: 30 })
      setSearchResults(res.result?.songs || [])
    } catch (e) {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  async function playSearchResult(song) {
    const fullSong = { id: song.id, name: song.name, ar: song.artists, al: song.album }
    setSheet(null)
    setSearchQuery('')
    setSearchResults([])
    setPlaylist([fullSong])
    setListenTab('player')
    await loadTrack(fullSong, 0)
  }

  return (
    <div className="listen-page">

      {/* ── header（me tab时隐藏）── */}
      {listenTab !== 'me' && (
      <div className="listen-header">
        {sheet === 'search' ? (
          <div className="search-bar-box">
            <button className="listen-cancel" onClick={() => { setSheet(null); setSearchQuery(''); setSearchResults([]) }}>取消</button>
            <input
              className="header-search-input"
              placeholder="搜索歌曲"
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); execSearch() } }}
              autoFocus
            />
            {searchQuery && (
              <button className="search-clear" onClick={() => { setSearchQuery(''); setSearchResults([]) }}>×</button>
            )}
            <button className="search-submit-btn" onClick={() => execSearch()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="7"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
            </button>
          </div>
        ) : (
          <>
            <button className="listen-back" onClick={() => navigate('/')}>‹</button>
            <span className="listen-title-music" onClick={() => setSheet('search')} style={{cursor:'pointer'}}>music</span>
            <div className="listen-header-actions">
              {phase === 'playing' && (
                <button className="icon-btn" onClick={() => setSheet(s => s === 'queue' ? null : 'queue')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/>
                    <line x1="3" y1="18" x2="15" y2="18"/>
                    <circle cx="19" cy="18" r="3"/>
                  </svg>
                </button>
              )}
            </div>
          </>
        )}
      </div>
      )}

      {/* ── no-api ── */}
      {phase === 'no-api' && (
        <div className="listen-empty">
          <p className="empty-hint">还没配置 API</p>
          <p className="empty-sub">在 Vercel 里设置 VITE_NC_API 环境变量后刷新</p>
        </div>
      )}

      {/* ── qr ── */}
      {phase === 'qr' && (
        <div className="listen-qr">
          {qrExpired ? (
            <div className="qr-expired" onClick={startQr}>
              <span>二维码过期了</span>
              <span className="qr-refresh">点击刷新</span>
            </div>
          ) : qrLoading ? (
            <div className="qr-loading-box">
              <div className="qr-spinner" />
              <span className="qr-loading-hint">连接中…</span>
            </div>
          ) : qrImg ? (
            <img src={qrImg} className="qr-img" alt="扫码登录" />
          ) : (
            <div className="qr-expired" onClick={startQr}>
              <span>加载失败</span>
              <span className="qr-refresh">点击重试</span>
            </div>
          )}
          <p className="qr-hint">扫码登录网易云</p>
          <p className="qr-sub">登录后就能一起听了</p>
        </div>
      )}

      {/* ── me view ── */}
      {phase === 'playing' && listenTab === 'me' && (
        <div className="listen-me-view">
          <div className="me-profile">
            <div className="me-avatar-wrap" onClick={() => setThornSpin(s => !s)}>
              <svg className={`me-avatar-thorns${thornSpin ? ' spinning' : ''}`} viewBox="-90 -90 180 180" xmlns="http://www.w3.org/2000/svg">
                {/* thorns without halos */}
                <polygon points="-3.1,-35.9 0,-72 3.1,-35.9" />
                <polygon points="14.6,-32.9 25.4,-47.7 19.1,-30.5" />
                <polygon points="26.8,-24.1 52.0,-40.6 29.8,-20.1" />
                <polygon points="34.4,-10.5 44.6,-11.1 35.3,-6.9" />
                <polygon points="35.7,4.4 72.4,15.4 34.4,10.5" />
                <polygon points="29.8,20.1 44.1,34.5 26.8,24.1" />
                <polygon points="3.1,35.9 1.7,50.0 -0.6,36.0" />
                <polygon points="-9.3,34.8 -26.0,71.4 -15.2,32.6" />
                <polygon points="-23.6,27.2 -36.8,36.8 -27.2,23.6" />
                <polygon points="-32.4,15.8 -63.0,25.5 -34.2,11.1" />
                <polygon points="-35.9,3.1 -48.0,1.7 -36.0,-0.6" />
                <polygon points="-35.5,-6.2 -69.5,-18.6 -33.8,-12.3" />
                <polygon points="-17.5,-31.5 -27.0,-58.0 -12.9,-33.6" />

                {/* thorn -140° with halo: back-ring → thorn → front-ring */}
                {/* ring center at 88% of thorn length: (-37.1,-31.1), rotate -50° */}
                <path d="M 7,0 A 7,2.5 0 0,0 -7,0" fill="none" stroke="#FFD700" strokeWidth="2.2" strokeLinecap="round" opacity="0.35" transform="translate(-37.1,-31.1) rotate(-50)" />
                <polygon points="-29.1,-21.2 -42.1,-35.4 -25.9,-25.0" />
                <path d="M -7,0 A 7,2.5 0 0,0 7,0" fill="none" stroke="#FFD700" strokeWidth="2.2" strokeLinecap="round" transform="translate(-37.1,-31.1) rotate(-50)" />

                {/* thorn 62° with halo: back-ring → thorn → front-ring */}
                {/* ring center at 78% of thorn length: (25.6,48.2), rotate 152° */}
                <path d="M 9,0 A 9,3 0 0,0 -9,0" fill="none" stroke="#FFD700" strokeWidth="2.5" strokeLinecap="round" opacity="0.35" transform="translate(25.6,48.2) rotate(152)" />
                <polygon points="19.1,30.5 32.9,61.8 14.6,32.9" />
                <path d="M -9,0 A 9,3 0 0,0 9,0" fill="none" stroke="#FFD700" strokeWidth="2.5" strokeLinecap="round" transform="translate(25.6,48.2) rotate(152)" />
              </svg>
              {userProfile?.avatarUrl
                ? <img src={userProfile.avatarUrl} className="me-avatar" alt="" />
                : <div className="me-avatar-placeholder" />
              }
            </div>
            <div className="me-nickname">{userProfile?.nickname || ''}</div>
          </div>
          <div className="me-section-label">我的歌单</div>
          <div className="me-playlists">
            {allPlaylists.map(pl => (
              <div key={pl.id} className="me-playlist-item" onClick={() => switchPlaylist(pl)}>
                <img
                  src={`${pl.coverImgUrl}?param=100y100`}
                  className="me-playlist-cover"
                  alt=""
                  onError={e => { e.currentTarget.style.background = 'var(--accent-light)'; e.currentTarget.removeAttribute('src') }}
                />
                <div className="me-playlist-info">
                  <div className="me-playlist-name">{pl.name}</div>
                  <div className="me-playlist-count">{pl.trackCount} 首</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── mini player (me view, when track loaded) ── */}
      {phase === 'playing' && listenTab === 'me' && track && (
        <div className="listen-mini-player" onClick={() => setListenTab('player')}>
          <div className={`mini-cover${playing ? ' spinning' : ''}`}>
            {track.albumArt
              ? <img src={`${track.albumArt}?param=80y80`} alt="" />
              : <div className="mini-cover-placeholder" />
            }
          </div>
          <div className="mini-info">
            <div className="mini-name">{track.name}</div>
            <div className="mini-artist">{track.artist}</div>
          </div>
          <button className="mini-ctrl-btn" onClick={e => { e.stopPropagation(); togglePlay() }}>
            {playing
              ? <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            }
          </button>
          <button className="mini-ctrl-btn" onClick={e => { e.stopPropagation(); skipTo(1) }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M5 5l10 7-10 7V5z"/><line x1="19" y1="5" x2="19" y2="19"/>
            </svg>
          </button>
        </div>
      )}

      {/* ── player view ── */}
      {phase === 'playing' && listenTab === 'player' && (
        <>
          {recommendations.length > 0 && (
            <div className="reco-section">

              <div
                className="reco-stage"
                onTouchStart={e => { recoTouchX.current = e.touches[0].clientX }}
                onTouchEnd={e => {
                  if (recoTouchX.current === null) return
                  const dx = recoTouchX.current - e.changedTouches[0].clientX
                  if (Math.abs(dx) > 36) {
                    if (dx > 0) setRecoIdx(i => Math.min(i + 1, recommendations.length - 1))
                    else setRecoIdx(i => Math.max(i - 1, 0))
                  }
                  recoTouchX.current = null
                }}
              >
                {recommendations.map((song, i) => {
                  const off = i - recoIdx
                  if (Math.abs(off) > 2) return null
                  const abs = Math.abs(off)
                  return (
                    <div
                      key={song.id}
                      className="reco-card"
                      style={{
                        transform: `translateX(calc(-50% + ${off * 76}px)) translateY(-50%) scale(${1 - abs * 0.12}) rotateY(${-off * 13}deg)`,
                        zIndex: 10 - abs * 3,
                        transition: 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                      }}
                      onClick={() => off === 0 ? playReco(song) : setRecoIdx(i)}
                    >
                      {song.al?.picUrl
                        ? <img src={`${song.al.picUrl}?param=300y300`} className="reco-card-img" alt="" />
                        : <div className="reco-card-img-placeholder" />
                      }
                      <div className="reco-card-info">
                        <div className="reco-card-name">{song.name}</div>
                        <div className="reco-card-artist">{song.ar?.map(a => a.name).join(' / ')}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="listen-body">

            {/* ── hanging star ornaments ── */}
            <div className="star-ornaments">
              <svg width="72" height="72" viewBox="0 0 72 72" style={{overflow:'visible'}}>
                <defs>
                  <filter id="dot-halo" x="-80%" y="-80%" width="260%" height="260%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur"/>
                    <feFlood floodColor="rgba(255,255,255,0.18)" result="col"/>
                    <feComposite in="col" in2="blur" operator="in" result="glow"/>
                    <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
                  </filter>
                </defs>

                {/* left star — longer string, click = playback mode */}
                <g style={{cursor:'pointer'}} onClick={() => setShowModeMenu(s => !s)}>
                  <circle cx="16" cy="4" r="4" fill="rgba(255,255,255,0.06)"/>
                  <circle cx="16" cy="4" r="3" fill="#242424" stroke="rgba(255,255,255,0.14)" strokeWidth="0.7" filter="url(#dot-halo)"/>
                  <line x1="16" y1="7" x2="16" y2="49" stroke="#6B1A1A" strokeWidth="1" strokeLinecap="round"/>
                  <polygon
                    points="16,49 18.06,54.17 23.61,54.53 19.33,58.08 20.70,63.47 16,60.5 11.30,63.47 12.67,58.08 8.39,54.53 13.94,54.17"
                    fill="#FFD700" style={{filter:'drop-shadow(0 2px 5px rgba(255,200,0,0.45))'}}
                  />
                </g>

                {/* right star — shorter string, click = AI cut permission */}
                <g style={{cursor:'pointer'}} onClick={() => setShowAiDialog(true)}>
                  <circle cx="46" cy="4" r="4" fill="rgba(255,255,255,0.06)"/>
                  <circle cx="46" cy="4" r="3" fill="#242424" stroke="rgba(255,255,255,0.14)" strokeWidth="0.7" filter="url(#dot-halo)"/>
                  <line x1="46" y1="7" x2="46" y2="31" stroke="#6B1A1A" strokeWidth="1" strokeLinecap="round"/>
                  <polygon
                    points="46,31 47.76,35.57 52.66,35.84 48.85,38.93 50.11,43.66 46,41 41.89,43.66 43.15,38.93 39.34,35.84 44.24,35.57"
                    fill="#FFD700" style={{filter:'drop-shadow(0 2px 5px rgba(255,200,0,0.45))'}}
                  />
                </g>
              </svg>
            </div>

            {/* playback mode menu */}
            {showModeMenu && (
              <>
                <div style={{position:'absolute',inset:0,zIndex:19}} onClick={() => setShowModeMenu(false)}/>
                <div className="mode-menu">
                  {[
                    {key:'sequential', label:'顺序播放'},
                    {key:'shuffle',    label:'随机播放'},
                    {key:'single',     label:'单曲循环'},
                  ].map(m => (
                    <button
                      key={m.key}
                      className={`mode-menu-item${playMode === m.key ? ' active' : ''}`}
                      onClick={() => { setPlayMode(m.key); setShowModeMenu(false) }}
                    >{m.label}</button>
                  ))}
                </div>
              </>
            )}

            {/* AI cut-song dialog */}
            {showAiDialog && (
              <div className="ai-dialog-overlay" onClick={() => setShowAiDialog(false)}>
                <div className="ai-dialog" onClick={e => e.stopPropagation()}>
                  <p className="ai-dialog-title">允许对方切歌？</p>
                  <p className="ai-dialog-sub">开启后，AI 可以帮你切换播放曲目</p>
                  <div className="ai-dialog-btns">
                    <button className="ai-dialog-btn" onClick={() => setShowAiDialog(false)}>不了</button>
                    <button className="ai-dialog-btn primary" onClick={() => setShowAiDialog(false)}>允许</button>
                  </div>
                </div>
              </div>
            )}

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

            {sheet === 'search' ? (
              <div className="listen-search-results">
                {searching && <p className="sheet-hint">搜索中…</p>}
                {!searching && !searchQuery && <p className="sheet-hint">输入歌曲名称搜索</p>}
                {!searching && searchQuery && searchResults.length === 0 && <p className="sheet-hint">没有找到</p>}
                {searchResults.map(song => (
                  <div key={song.id} className="sheet-item" onClick={() => playSearchResult(song)}>
                    <div className="sheet-item-name">{song.name}</div>
                    <div className="sheet-item-sub">{song.artists?.map(a => a.name).join(' / ')}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="listen-lyrics" ref={lyricBoxRef}>
                {lyrics.length > 0
                  ? lyrics.map((l, i) => (
                      <p key={i} className={`lyric-line${i === curLyric ? ' active' : ''}`}>{l.text}</p>
                    ))
                  : <p className="lyric-empty">暂无歌词</p>
                }
              </div>
            )}
          </div>
        </>
      )}

      <audio ref={audioRef} onTimeUpdate={handleTimeUpdate} onEnded={() => {
        if (playMode === 'single') {
          if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play().catch(() => {}) }
        } else { skipTo(1) }
      }} />

      {/* ── bottom sheet (queue only) ── */}
      {sheet && sheet !== 'search' && (
        <div className="sheet-overlay" onClick={() => setSheet(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <p className="sheet-title">播放列表</p>
            <div className="sheet-list">
              {playlist.map((song, i) => (
                <div
                  key={song.id}
                  className={`sheet-item${i === playIdx ? ' playing' : ''}`}
                  onClick={() => { loadTrack(song, i); setSheet(null) }}
                >
                  <div className="sheet-item-name">{song.name}</div>
                  <div className="sheet-item-sub">{song.ar?.map(a => a.name).join(' / ')}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── bottom nav ── */}
      {phase === 'playing' && (
        <nav className="listen-nav">
          <button
            className={`listen-nav-item${listenTab === 'player' ? ' active' : ''}`}
            onClick={() => setListenTab('player')}
          >
            <span className="listen-nav-word">listen</span>
          </button>
          <button className="listen-nav-item listen-nav-heart">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </button>
          <button
            className={`listen-nav-item${listenTab === 'me' ? ' active' : ''}`}
            onClick={() => setListenTab('me')}
          >
            <span className="listen-nav-word">home</span>
          </button>
        </nav>
      )}
    </div>
  )
}
