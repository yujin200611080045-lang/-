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

// Crack base points — scale factor k=1 is "closed", k=2.5 is "fully open"
const CRACK_L = [[0,0],[22,25],[44,51],[58,87],[86,108],[130,158],[131,201],[176,205],[184,244],[210,264],[248,274],[273,296],[298,318],[320,340]]
const CRACK_R = [[0,0],[22,23],[50,43],[74,68],[112,82],[189,145],[212,216],[242,234],[263,259],[278,292],[298,316],[320,340]]

function scalePt(x, y, k) {
  if (k === 1) return [x, y]
  const t = (320*x + 340*y) / 218000
  const fx = 320*t, fy = 340*t
  return [Math.round((fx + k*(x-fx))*10)/10, Math.round((fy + k*(y-fy))*10)/10]
}
function crackPolyPts(edge, k) {
  return edge.map(([x,y]) => scalePt(x,y,k)).map(p => p.join(',')).join(' ')
}
function crackFillPts(k) {
  const l = CRACK_L.map(([x,y]) => scalePt(x,y,k))
  const r = CRACK_R.map(([x,y]) => scalePt(x,y,k)).slice(1,-1).reverse()
  return [...l,...r].map(p => p.join(',')).join(' ')
}

function crackClipPath(k) {
  const l = CRACK_L.map(([x,y]) => scalePt(x,y,k))
  const r = CRACK_R.map(([x,y]) => scalePt(x,y,k)).slice(1,-1).reverse()
  return 'polygon(' + [...l,...r].map(([x,y]) => `${x}px ${y}px`).join(',') + ')'
}

// 棉线效果：3股丝丝缕缕，从缝隙边弯曲延伸，螺旋缠住头像
// cx/cy: 头像中心, fx/fy: 缝隙锚点, entryAngle: 入线侧角度, cpOffX/Y: 曲线控制点偏移
function bindStrandPaths(cx, cy, fx, fy, entryAngle, cpOffX, cpOffY) {
  const r = 24
  const entryX = cx + r * Math.cos(entryAngle)
  const entryY = cy + r * Math.sin(entryAngle)
  const cpx = (fx + entryX) / 2 + cpOffX
  const cpy = (fy + entryY) / 2 + cpOffY

  // 估算二次贝塞尔弧长
  function bezLen(fxs, fys) {
    let len = 0, px = fxs, py = fys
    for (let i = 1; i <= 24; i++) {
      const t = i / 24, mt = 1 - t
      const x = mt*mt*fxs + 2*mt*t*cpx + t*t*entryX
      const y = mt*mt*fys + 2*mt*t*cpy + t*t*entryY
      len += Math.hypot(x - px, y - py); px = x; py = y
    }
    return len
  }

  // 入线方向的法向量，用于 3 股横向展开
  const pnx = Math.cos(entryAngle + Math.PI / 2)
  const pny = Math.sin(entryAngle + Math.PI / 2)

  return [
    { sOff: -1.4, rD: -0.8, aO: -0.06, op: 0.55, sw: 0.7  },
    { sOff:  0,   rD:  0,   aO:  0,    op: 0.93, sw: 1.15  },
    { sOff:  1.4, rD:  0.7, aO:  0.06, op: 0.50, sw: 0.65  },
  ].map(({ sOff, rD, aO, op, sw }) => {
    const fxs = fx + sOff * pnx, fys = fy + sOff * pny
    let d = `M${fxs.toFixed(1)},${fys.toFixed(1)} Q${cpx.toFixed(1)},${cpy.toFixed(1)} ${entryX.toFixed(1)},${entryY.toFixed(1)}`
    let len = bezLen(fxs, fys)
    let px = entryX, py = entryY
    for (let i = 1; i <= 64; i++) {
      const f = i / 64
      const ang = entryAngle + aO + f * 1.9 * 2 * Math.PI
      const rr = r + rD + f * 9 + 1.5 * Math.sin(ang * 3)
      const x = cx + rr * Math.cos(ang)
      const y = cy + rr * Math.sin(ang)
      d += ` L${x.toFixed(1)},${y.toFixed(1)}`
      len += Math.hypot(x - px, y - py)
      px = x; py = y
    }
    return { d, len, op, sw }
  })
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
  const [showPlaylistModal, setShowPlaylistModal] = useState(false)
  const [sheet, setSheet] = useState(null)

  const [crackK, setCrackK] = useState(1)
  const crackAnimRef = useRef(false)
  const threadAnimRef = useRef(false)
  const [threadStep, setThreadStep] = useState(0)
  const [threadOpacity, setThreadOpacity] = useState(1)
  const [bindReveal, setBindReveal] = useState(0)
  const [pausedInListen, setPausedInListen] = useState(false)
  const [tgMessages, setTgMessages] = useState([])
  const [tgInput, setTgInput] = useState('')
  const [tgShowInput, setTgShowInput] = useState(false)
  const [tgAiTyping, setTgAiTyping] = useState(false)
  // together player — independent from main player
  const tgAudioRef = useRef(null)
  const tgPlayIdxRef = useRef(0)
  const [tgTrack, setTgTrack] = useState(null)
  const [tgPlaying, setTgPlaying] = useState(false)
  const [tgPlayIdx, setTgPlayIdx] = useState(0)
  const [tgLyrics, setTgLyrics] = useState([])
  const [tgCurLyric, setTgCurLyric] = useState(0)
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
  const tgTogglePlayRef = useRef(null)
  const tgSkipToRef = useRef(null)
  const listenTabRef = useRef('player')
  const tgChatHistoryRef = useRef([])
  const tgTopScrollRef = useRef(null)
  const tgBotScrollRef = useRef(null)
  const tgMsgIdRef = useRef(0)

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

  // 广播播放状态供悬浮条使用（together tab 优先用 tg*，tgTrack 空时回退 main track）
  useEffect(() => {
    const isTg = listenTab === 'together'
    const activeTrack = (isTg ? tgTrack : null) ?? track
    window.__musicState = {
      track:      activeTrack,
      playing:    isTg ? tgPlaying : playing,
      curLyric:   isTg ? tgCurLyric : curLyric,
      lyrics:     isTg ? tgLyrics : lyrics,
      pausedInListen,
    }
    window.dispatchEvent(new CustomEvent('music:statechange'))
  }, [listenTab, track, playing, curLyric, lyrics, tgTrack, tgPlaying, tgCurLyric, tgLyrics, pausedInListen])

  // 保持最新函数引用，避免 stale closure
  useEffect(() => { togglePlayRef.current = togglePlay })
  useEffect(() => { skipToRef.current = skipTo })
  useEffect(() => { tgTogglePlayRef.current = tgTogglePlay })
  useEffect(() => { tgSkipToRef.current = tgSkipTo })
  useEffect(() => { listenTabRef.current = listenTab }, [listenTab])

  useEffect(() => {
    if (tgMessages.length === 0) return
    const last = tgMessages[tgMessages.length - 1]
    if (last.role === 'user') {
      const el = tgTopScrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    } else {
      const el = tgBotScrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [tgMessages])

  // 监听悬浮条发出的控制事件，together tab 时路由到 tg* 播放器
  useEffect(() => {
    const onToggle = () => {
      if (listenTabRef.current === 'together') tgTogglePlayRef.current?.()
      else togglePlayRef.current?.()
    }
    const onNext = () => {
      if (listenTabRef.current === 'together') tgSkipToRef.current?.(1)
      else skipToRef.current?.(1)
    }
    const onPrev = () => {
      if (listenTabRef.current === 'together') tgSkipToRef.current?.(-1)
      else skipToRef.current?.(-1)
    }
    window.addEventListener('music:toggle', onToggle)
    window.addEventListener('music:next', onNext)
    window.addEventListener('music:prev', onPrev)
    return () => {
      window.removeEventListener('music:toggle', onToggle)
      window.removeEventListener('music:next', onNext)
      window.removeEventListener('music:prev', onPrev)
    }
  }, [])

  // 进入together tab时自动加载第一首
  useEffect(() => {
    if (listenTab === 'together' && !tgTrack && playlist.length > 0) {
      tgLoadTrack(playlist[0], 0)
    }
  }, [listenTab])

  function openCrack() {
    if (crackAnimRef.current || crackK > 1) return
    crackAnimRef.current = true
    const frames = [1.2, 1.5, 1.85, 2.2, 2.55, 2.9, 3.15, 3.35, 3.5]
    const waits  = [0, 290, 260, 330, 200, 280, 220, 310, 190]
    let total = 0
    frames.forEach((k, i) => {
      total += waits[i]
      setTimeout(() => {
        setCrackK(k)
        if (i === frames.length - 1) crackAnimRef.current = false
      }, total)
    })
    // 同步开始穿线动画
    if (!threadAnimRef.current) {
      threadAnimRef.current = true
      setThreadOpacity(1)
      const tDelays = [0, 230, 450, 670, 880, 1090, 1300, 1510, 1720]
      tDelays.forEach((d, i) => setTimeout(() => setThreadStep(i + 1), d))
      // 两根缠绕线随裂缝一起从缝隙边蔓延出去
      const bDelays = [0, 240, 480, 720, 960, 1200, 1440, 1680, 1920]
      bDelays.forEach((d, i) => setTimeout(() => setBindReveal((i + 1) / bDelays.length), d))
    }
  }

  function closeCrack() {
    if (crackAnimRef.current || crackK < 3.5) return
    // 红线先淡出
    setThreadOpacity(0)
    setTimeout(() => {
      setThreadStep(0)
      setBindReveal(0)
      threadAnimRef.current = false
      setThreadOpacity(1)
    }, 680)
    crackAnimRef.current = true
    const frames = [3.1, 2.65, 2.2, 1.8, 1.45, 1.15, 1.0]
    const waits  = [0, 250, 270, 200, 290, 210, 260]
    let total = 0
    frames.forEach((k, i) => {
      total += waits[i]
      setTimeout(() => {
        setCrackK(k)
        if (i === frames.length - 1) crackAnimRef.current = false
      }, total)
    })
  }


  async function tgLoadTrack(song, idx) {
    const a = tgAudioRef.current
    if (!a || !song) return
    tgPlayIdxRef.current = idx
    setTgPlayIdx(idx)
    setTgLyrics([])
    setTgCurLyric(0)
    const meta = {
      id: song.id,
      name: song.name,
      artist: song.ar?.map(x => x.name).join(' / ') || '',
      albumArt: song.al?.picUrl || '',
    }
    setTgTrack(meta)
    try {
      const [urlRes, lrcRes] = await Promise.all([
        req('/song/url', { id: song.id }),
        req('/lyric', { id: song.id }),
      ])
      const url = urlRes.data?.[0]?.url
      if (url) {
        a.src = url
        a.play().then(() => { setTgPlaying(true); setPausedInListen(false) }).catch(() => setTgPlaying(false))
      }
      setTgLyrics(parseLrc(lrcRes.lrc?.lyric || ''))
    } catch {}
  }

  function tgTogglePlay() {
    const a = tgAudioRef.current
    if (!a) return
    const fromFloating = !!window.__pausedFromFloatingBar
    window.__pausedFromFloatingBar = false
    if (tgPlaying) {
      a.pause(); setTgPlaying(false)
      if (!fromFloating) setPausedInListen(true)
    } else {
      a.play().then(() => { setTgPlaying(true); setPausedInListen(false) }).catch(() => {})
    }
  }

  function tgSkipTo(delta) {
    if (!playlist.length) return
    const idx = (tgPlayIdx + delta + playlist.length) % playlist.length
    tgLoadTrack(playlist[idx], idx)
  }

  async function tgSendMessage() {
    const text = tgInput.trim()
    if (!text || tgAiTyping) return
    setTgInput('')
    setTgShowInput(false)
    const id = ++tgMsgIdRef.current
    setTgMessages(prev => [...prev, { id, role: 'user', text }])
    tgChatHistoryRef.current = [...tgChatHistoryRef.current, { role: 'user', content: text }]
    setTgAiTyping(true)
    try {
      const currentLyric = tgLyrics[tgCurLyric]?.text || ''
      const trackInfo = tgTrack ? `${tgTrack.name}${tgTrack.artist ? ` - ${tgTrack.artist}` : ''}` : '未知歌曲'
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': import.meta.env.VITE_ANTHROPIC_KEY || '',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          system: `你是小克，正在和觎烬一起听《${trackInfo}》。${currentLyric ? `当前歌词：「${currentLyric}」。` : ''}用轻松自然的口吻聊，简短，像真人发消息。`,
          messages: tgChatHistoryRef.current,
        }),
      })
      const data = await resp.json()
      const fullText = data.content?.[0]?.text?.trim() || ''
      if (!fullText) return
      tgChatHistoryRef.current = [...tgChatHistoryRef.current, { role: 'assistant', content: fullText }]
      const sentences = fullText
        .replace(/([。！？…\.\!\?]+)\s*/g, '$1\n')
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean)
      for (let i = 0; i < sentences.length; i++) {
        await new Promise(r => setTimeout(r, i === 0 ? 500 : 900))
        setTgMessages(prev => [...prev, { id: ++tgMsgIdRef.current, role: 'ai', text: sentences[i] }])
      }
    } catch (e) {
      console.error('tg chat error', e)
    } finally {
      setTgAiTyping(false)
    }
  }

  function togglePlay() {
    const a = audioRef.current
    if (!a) return
    const fromFloating = !!window.__pausedFromFloatingBar
    window.__pausedFromFloatingBar = false
    if (playing) {
      a.pause(); setPlaying(false)
      if (!fromFloating) setPausedInListen(true)
    } else {
      a.play(); setPlaying(true); setPausedInListen(false)
    }
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

      {/* ── header（me / together tab时隐藏）── */}
      {listenTab === 'player' && (
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
          <button className="me-section-btn" onClick={() => setShowPlaylistModal(true)}>
            <span>我的歌单</span>
            <span className="me-section-arrow">›</span>
          </button>
        </div>
      )}

      {/* ── together view ── */}
      {phase === 'playing' && listenTab === 'together' && (
        <div className="together-view">

          {/* 上方聊天区：觎烬的消息，点击打开输入框 */}
          <div className="tg-chat-area tg-chat-top" onClick={() => setTgShowInput(true)}>
            <div className="tg-chat-scroll" ref={tgTopScrollRef}>
              {tgMessages.filter(m => m.role === 'user').map(m => (
                <div key={m.id} className="tg-bubble tg-bubble-user">{m.text}</div>
              ))}
            </div>
          </div>

          <div className="together-stage" onClick={() => { if (crackK >= 3.5) closeCrack() }}>
            <div className="together-box" />

            {/* player revealed through the crack */}
            <div
              className="together-player"
              style={{ clipPath: crackClipPath(crackK) }}
              onClick={e => e.stopPropagation()}
            >
              <div className="tgp-info">
                <div className="tgp-title">{tgTrack?.name || '—'}</div>
                <div className="tgp-artist">{tgTrack?.artist}</div>
              </div>
              <div className="tgp-ctrls">
                <button className="tgp-btn" onClick={e => { e.stopPropagation(); tgSkipTo(-1) }}>
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
                </button>
                <button className="tgp-btn tgp-play" onClick={e => { e.stopPropagation(); tgTogglePlay() }}>
                  {tgPlaying
                    ? <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                    : <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  }
                </button>
                <button className="tgp-btn" onClick={e => { e.stopPropagation(); tgSkipTo(1) }}>
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18 14.5 12 6 6v12zM16 6h2v12h-2z"/></svg>
                </button>
              </div>
              {tgLyrics.length > 0 && (
                <div className="tgp-lyrics">
                  {tgLyrics[tgCurLyric - 1] && <div className="tgp-lyric dim">{tgLyrics[tgCurLyric - 1].text}</div>}
                  {tgLyrics[tgCurLyric]     && <div className="tgp-lyric cur">{tgLyrics[tgCurLyric].text}</div>}
                  {tgLyrics[tgCurLyric + 1] && <div className="tgp-lyric dim">{tgLyrics[tgCurLyric + 1].text}</div>}
                </div>
              )}
            </div>

            <svg className="together-crack" viewBox="0 0 320 340" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <filter id="thread-over" x="-40%" y="-40%" width="180%" height="180%">
                  <feDropShadow dx="0.5" dy="1.1" stdDeviation="0.9" floodColor="#000" floodOpacity="0.5"/>
                </filter>
                <filter id="thread-under" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="0.65"/>
                </filter>
              </defs>

              <polygon
                className="crack-fill"
                points={crackFillPts(crackK)}
                style={{ fill: 'transparent', pointerEvents: crackK >= 3.5 ? 'none' : 'all' }}
                onClick={(e) => { e.stopPropagation(); if (crackK <= 1) openCrack() }}
              />

              {/* 穿线返回段：在裂缝边线下面渲染，模拟线穿入材质 */}
              {threadStep > 0 && (() => {
                const segs = [
                  { a:[50,43],   via:[74,68],   b:[112,82],  step:2 },
                  { a:[86,108],  via:[130,158], b:[131,201], step:4 },
                  { a:[189,145], via:null,      b:[212,216], step:6 },
                  { a:[184,244], via:[210,264], b:[248,274], step:8 },
                ]
                return (
                  <g filter="url(#thread-under)" style={{ opacity: threadOpacity, transition: 'opacity 0.65s ease-out' }}>
                    {segs.map(({ a, via, b, step }, i) => {
                      const [ax, ay] = scalePt(a[0], a[1], crackK)
                      const [bx, by] = scalePt(b[0], b[1], crackK)
                      const pathD = via
                        ? (() => { const [vx,vy] = scalePt(via[0],via[1],crackK); return `M${ax},${ay} Q${vx},${vy} ${bx},${by}` })()
                        : `M${ax},${ay} L${bx},${by}`
                      return (
                        <path key={i} d={pathD} fill="none" strokeLinecap="round"
                          style={{
                            stroke: 'rgba(148,18,18,0.48)',
                            strokeWidth: '0.85',
                            strokeDasharray: '400 400',
                            strokeDashoffset: threadStep >= step ? 0 : 400,
                            transition: 'stroke-dashoffset 0.18s linear',
                          }}
                        />
                      )
                    })}
                  </g>
                )
              })()}

              <polyline className="crack-edge" points={crackPolyPts(CRACK_L, crackK)} />
              <polyline className="crack-edge" points={crackPolyPts(CRACK_R, crackK)} />

              {/* 穿线跨越段：在裂缝边线上面渲染，浮于表面，带立体阴影 */}
              {threadStep > 0 && (() => {
                const segs = [
                  { a:[44,51],   b:[50,43],   bend:-1, step:1 },
                  { a:[112,82],  b:[86,108],  bend: 1, step:3 },
                  { a:[131,201], b:[189,145], bend:-1, step:5 },
                  { a:[212,216], b:[184,244], bend: 1, step:7 },
                  { a:[248,274], b:[263,259], bend:-1, step:9 },
                ]
                return (
                  <g filter="url(#thread-over)" style={{ opacity: threadOpacity, transition: 'opacity 0.65s ease-out' }}>
                    {segs.map(({ a, b, bend, step }, i) => {
                      const [ax, ay] = scalePt(a[0], a[1], crackK)
                      const [bx, by] = scalePt(b[0], b[1], crackK)
                      const mx = (ax+bx)/2, my = (ay+by)/2
                      const dx = bx-ax, dy = by-ay
                      const len = Math.sqrt(dx*dx+dy*dy) || 1
                      const bAmt = bend * Math.min(len*0.18, 16)
                      const cpx = mx + bAmt*(-dy/len)
                      const cpy = my + bAmt*(dx/len)
                      return (
                        <path key={i} d={`M${ax},${ay} Q${cpx},${cpy} ${bx},${by}`} fill="none" strokeLinecap="round"
                          style={{
                            stroke: 'rgba(178,24,24,0.92)',
                            strokeWidth: '1.2',
                            strokeDasharray: '400 400',
                            strokeDashoffset: threadStep >= step ? 0 : 400,
                            transition: 'stroke-dashoffset 0.22s linear',
                          }}
                        />
                      )
                    })}
                  </g>
                )
              })()}

              {/* 缠绕棉线：3股丝丝缕缕，左下从右侧向上拱出，右上从左下向下拱出 */}
              {bindReveal > 0 && (() => {
                const prog = Math.min(1, (crackK - 1) / 2.5)
                const blCx = (81 + prog*(8  - 81 )) + 24
                const blCy = (204 + prog*(284 - 204)) + 24
                const trCx = (191 + prog*(264 - 191)) + 24
                const trCy = (88  + prog*(8  - 88 )) + 24
                const blO = scalePt(131, 201, crackK)
                const trO = scalePt(189, 145, crackK)
                const blStrands = bindStrandPaths(blCx, blCy, blO[0], blO[1], 0, 30, -15)
                const trStrands = bindStrandPaths(trCx, trCy, trO[0], trO[1], Math.PI * 5 / 4, -15, 30)
                return (
                  <g filter="url(#thread-over)" style={{ opacity: threadOpacity, transition: 'opacity 0.65s ease-out' }}>
                    {[...blStrands, ...trStrands].map(({ d, len, op, sw }, i) => (
                      <path key={i} d={d} fill="none" strokeLinecap="round" strokeLinejoin="round"
                        style={{
                          stroke: `rgba(165,18,18,${op})`,
                          strokeWidth: sw,
                          strokeDasharray: len,
                          strokeDashoffset: len * (1 - bindReveal),
                          transition: 'stroke-dashoffset 0.24s linear',
                        }}
                      />
                    ))}
                  </g>
                )
              })()}
            </svg>

            {(() => {
              const prog = Math.min(1, (crackK - 1) / 2.5)
              const blStyle = { left: Math.round(81 + prog*(8-81))+'px', top: Math.round(204 + prog*(284-204))+'px', transition: 'left 0.18s ease, top 0.18s ease' }
              const trStyle = { left: Math.round(191 + prog*(264-191))+'px', top: Math.round(88 + prog*(8-88))+'px', transition: 'left 0.18s ease, top 0.18s ease' }
              return (<>
                <div className="together-avatar" style={blStyle} onClick={e => e.stopPropagation()}>
                  <img src="/together-bl.jpeg" className="together-avatar-img" alt="" />
                </div>
                <div className="together-avatar" style={trStyle} onClick={e => e.stopPropagation()}>
                  <img src="/together-tr.jpeg" className="together-avatar-img" alt="" />
                </div>
              </>)
            })()}
          </div>

          {/* 下方聊天区：小克的消息 */}
          <div className="tg-chat-area tg-chat-bot">
            <div className="tg-chat-scroll" ref={tgBotScrollRef}>
              {tgMessages.filter(m => m.role === 'ai').map(m => (
                <div key={m.id} className="tg-bubble tg-bubble-ai">{m.text}</div>
              ))}
              {tgAiTyping && (
                <div className="tg-bubble tg-bubble-ai tg-typing">
                  <span className="tg-dot"/><span className="tg-dot"/><span className="tg-dot"/>
                </div>
              )}
            </div>
          </div>

          {/* 输入浮层 */}
          {tgShowInput && (
            <div className="tg-input-overlay" onClick={() => setTgShowInput(false)}>
              <div className="tg-input-box" onClick={e => e.stopPropagation()}>
                <input
                  className="tg-input"
                  value={tgInput}
                  onChange={e => setTgInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); tgSendMessage() } }}
                  placeholder="说点什么…"
                  autoFocus
                />
                <button className="tg-send-btn" onClick={tgSendMessage} disabled={!tgInput.trim() || tgAiTyping}>
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </button>
              </div>
            </div>
          )}
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
            {/* left star — longer line — mode menu */}
            <div className="star-ornament star-ornament-left">
              <svg width="40" height="80" viewBox="0 0 40 80">
                <defs>
                  <filter id="dot-halo-l" x="-80%" y="-80%" width="260%" height="260%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur"/>
                    <feFlood floodColor="rgba(255,255,255,0.18)" result="col"/>
                    <feComposite in="col" in2="blur" operator="in" result="glow"/>
                    <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
                  </filter>
                </defs>
                <g style={{cursor:'pointer'}} onClick={() => setShowModeMenu(s => !s)}>
                  <circle cx="16" cy="10" r="4.5" fill="rgba(255,255,255,0.06)"/>
                  <circle cx="16" cy="10" r="3" fill="#242424" stroke="rgba(255,255,255,0.14)" strokeWidth="0.7" filter="url(#dot-halo-l)"/>
                  <line x1="16" y1="14" x2="16" y2="55" stroke="#6B1A1A" strokeWidth="1" strokeLinecap="round"/>
                  <polygon
                    points="16,55 18.94,58.96 23.61,60.53 20.76,64.55 20.70,69.47 16,68 11.30,69.47 11.24,64.55 8.39,60.53 13.06,58.96"
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
      <audio ref={tgAudioRef}
        onTimeUpdate={() => {
          const a = tgAudioRef.current
          if (!a || !a.duration) return
          let idx = 0
          for (let i = 0; i < tgLyrics.length; i++) {
            if (tgLyrics[i].time <= a.currentTime) idx = i
            else break
          }
          setTgCurLyric(idx)
        }}
        onEnded={() => tgSkipTo(1)}
      />

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

      {/* ── playlist modal ── */}
      {showPlaylistModal && (
        <div className="playlist-modal-overlay" onClick={() => setShowPlaylistModal(false)}>
          <div className="playlist-modal" onClick={e => e.stopPropagation()}>
            <div className="playlist-modal-header">
              <span className="playlist-modal-title">我的歌单</span>
              <button className="playlist-modal-close" onClick={() => setShowPlaylistModal(false)}>×</button>
            </div>
            <div className="playlist-modal-list">
              {allPlaylists.map(pl => (
                <div key={pl.id} className="playlist-modal-item"
                  onClick={() => { switchPlaylist(pl); setShowPlaylistModal(false) }}>
                  <img
                    src={`${pl.coverImgUrl}?param=100y100`}
                    className="playlist-modal-cover"
                    alt=""
                    onError={e => { e.currentTarget.style.background = 'var(--accent-light)'; e.currentTarget.removeAttribute('src') }}
                  />
                  <div className="playlist-modal-info">
                    <div className="playlist-modal-name">{pl.name}</div>
                    <div className="playlist-modal-count">{pl.trackCount} 首</div>
                  </div>
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
          <button
            className={`listen-nav-item listen-nav-heart${listenTab === 'together' ? ' active' : ''}`}
            onClick={() => setListenTab('together')}
          >
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
