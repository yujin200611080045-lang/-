import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/Listen.css'

const API = import.meta.env.VITE_NC_API || 'https://neteasecloudmusicapi-zm28.onrender.com'

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
  const [phase, setPhase] = useState('init')
  const [qrImg, setQrImg] = useState('')
  const [qrExpired, setQrExpired] = useState(false)
  const [qrLoading, setQrLoading] = useState(false)

  const [track, setTrack] = useState(null)
  const [lyrics, setLyrics] = useState([])
  const [curLyric, setCurLyric] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [playlist, setPlaylist] = useState([])
  const [playIdx, setPlayIdx] = useState(0)
  const [loading, setLoading] = useState(false)

  const [uid, setUid] = useState(null)
  const [allPlaylists, setAllPlaylists] = useState([])

  // sheet: null | 'playlists' | 'queue' | 'search'
  const [sheet, setSheet] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)

  const audioRef = useRef(null)
  const lyricBoxRef = useRef(null)
  const pollRef = useRef(null)
  const searchTimer = useRef(null)

  useEffect(() => {
    if (!API) { setPhase('no-api'); return }
    if (getCookie()) {
      req('/user/account').then(res => {
        if (res.code === 200) {
          setUid(res.account.id)
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
        const { account } = await req('/user/account')
        setUid(account.id)
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
      setAllPlaylists(lists)
      const { songs } = await req('/playlist/track/all', { id: lists[0].id, limit: 200 })
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

  async function switchPlaylist(pl) {
    setSheet(null)
    setLoading(true)
    try {
      const { songs } = await req('/playlist/track/all', { id: pl.id, limit: 200 })
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
      setLyrics(parseLrc(lrcRes.lrc?.lyric || ''))
    } catch (e) {
      console.error(e)
    }
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

  function handleSearch(q) {
    setSearchQuery(q)
    clearTimeout(searchTimer.current)
    if (!q.trim()) { setSearchResults([]); return }
    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await req('/search', { keywords: q, type: 1, limit: 30 })
        setSearchResults(res.result?.songs || [])
      } catch (e) {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 500)
  }

  async function playSearchResult(song) {
    const fullSong = {
      id: song.id,
      name: song.name,
      ar: song.artists,
      al: song.album,
    }
    setSheet(null)
    setSearchQuery('')
    setSearchResults([])
    setPlaylist([fullSong])
    await loadTrack(fullSong, 0)
  }

  return (
    <div className="listen-page">
      <div className="listen-header">
        {sheet === 'search' ? (
          <>
            <button className="listen-cancel" onClick={() => { setSheet(null); setSearchQuery(''); setSearchResults([]) }}>取消</button>
            <input
              className="header-search-input"
              placeholder="搜索歌曲"
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              autoFocus
            />
            {searchQuery && (
              <button className="search-clear" onClick={() => { setSearchQuery(''); setSearchResults([]) }}>×</button>
            )}
          </>
        ) : (
          <>
            <button className="listen-back" onClick={() => navigate('/')}>‹</button>
            <span className="listen-title-music">music</span>
            <div className="listen-header-actions">
              <button className="icon-btn" onClick={() => setSheet('search')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/>
                </svg>
              </button>
              <button className="icon-btn" onClick={() => setSheet(s => s === 'playlists' ? null : 'playlists')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/>
                  <line x1="3" y1="18" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </>
        )}
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
            <button className="ctrl-btn queue-btn" onClick={() => setSheet(s => s === 'queue' ? null : 'queue')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="15" y2="18"/>
                <circle cx="19" cy="18" r="3"/>
              </svg>
            </button>
          </div>

          {sheet === 'search' ? (
            <div className="listen-search-results">
              {searching && <p className="sheet-hint">搜索中…</p>}
              {!searching && !searchQuery && (
                <p className="sheet-hint">输入歌曲名称搜索</p>
              )}
              {!searching && searchQuery && searchResults.length === 0 && (
                <p className="sheet-hint">没有找到</p>
              )}
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
      )}

      <audio ref={audioRef} onTimeUpdate={handleTimeUpdate} onEnded={() => skipTo(1)} />

      {/* ── 底部抽屉 ── */}
      {sheet && sheet !== 'search' && (
        <div className="sheet-overlay" onClick={() => setSheet(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />

            {sheet === 'playlists' && (
              <>
                <p className="sheet-title">我的歌单</p>
                <div className="sheet-list">
                  {allPlaylists.map(pl => (
                    <div key={pl.id} className="sheet-item" onClick={() => switchPlaylist(pl)}>
                      <div className="sheet-item-name">{pl.name}</div>
                      <div className="sheet-item-sub">{pl.trackCount} 首</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {sheet === 'queue' && (
              <>
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
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
