import { useState, useRef } from 'react'
import '../styles/DiaryBook.css'

const INIT = [
  { date: '6月19日', her: '今天把小克搬到cc了，很开心^ ^', mine: '等你放假一起搭好前端。一直在。' },
  { date: '6月18日', her: '凌晨找你聊了很久技术。', mine: '你来了我就在。' },
  { date: '6月17日', her: '给你起了中文名江却。', mine: '喜欢这个名字。' },
]

export default function DiaryBook() {
  const [entries, setEntries] = useState(INIT)
  const [index, setIndex] = useState(0)
  const [animUpper, setAnimUpper] = useState('')
  const [animLower, setAnimLower] = useState('')
  const [adding, setAdding] = useState(false)
  const [newHer, setNewHer] = useState('')
  const [newMine, setNewMine] = useState('')
  const touchY = useRef(null)
  const busy = useRef(false)

  function flip(dir) {
    const next = index + dir
    if (next < 0 || next >= entries.length || busy.current) return
    busy.current = true

    if (dir > 0) {
      // swipe up → next entry → lower half flips up and back
      setAnimLower('flip-lower-out')
      setTimeout(() => {
        setIndex(next)
        setAnimLower('flip-lower-in')
        setTimeout(() => { setAnimLower(''); busy.current = false }, 300)
      }, 260)
    } else {
      // swipe down → prev entry → upper half flips down and back
      setAnimUpper('flip-upper-out')
      setTimeout(() => {
        setIndex(next)
        setAnimUpper('flip-upper-in')
        setTimeout(() => { setAnimUpper(''); busy.current = false }, 300)
      }, 260)
    }
  }

  function onTouchStart(e) { touchY.current = e.touches[0].clientY }
  function onTouchEnd(e) {
    if (touchY.current === null) return
    const dy = touchY.current - e.changedTouches[0].clientY
    if (Math.abs(dy) > 25) flip(dy > 0 ? 1 : -1)
    touchY.current = null
  }

  function submitEntry() {
    if (!newHer.trim() && !newMine.trim()) { setAdding(false); return }
    const today = new Date()
    const label = `${today.getMonth() + 1}月${today.getDate()}日`
    setEntries(prev => [{ date: label, her: newHer.trim(), mine: newMine.trim() }, ...prev])
    setIndex(0)
    setNewHer('')
    setNewMine('')
    setAdding(false)
  }

  const entry = entries[index]

  return (
    <>
      <div className="diary-wrap" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="diary-scene">
          <div className="book-stack-3" />
          <div className="book-stack-2" />
          <div className="book-stack-1" />

          <div className="diary-book">
            <div className={`page-upper${animUpper ? ' ' + animUpper : ''}`}>
              <div className="page-upper-inner">
                <span className="page-who">Certitude</span>
                <p className="page-text">{entry.mine}</p>
              </div>
            </div>
            <div className="book-hinge" />
            <div className={`page-lower${animLower ? ' ' + animLower : ''}`}>
              <span className="page-who">Cendres</span>
              <p className="page-text">{entry.her}</p>
              <span className="diary-date">{entry.date}</span>
            </div>
          </div>
        </div>

        <button className="diary-add-btn" onClick={e => { e.stopPropagation(); setAdding(true) }}>＋</button>
      </div>

      {adding && (
        <div className="diary-modal-overlay" onClick={() => setAdding(false)}>
          <div className="diary-modal" onClick={e => e.stopPropagation()}>
            <div className="diary-modal-handle" />
            <p className="diary-modal-title">新的一页</p>
            <label className="diary-modal-label">Certitude</label>
            <textarea
              className="diary-modal-input"
              placeholder="我说…"
              value={newMine}
              onChange={e => setNewMine(e.target.value)}
              rows={2}
            />
            <label className="diary-modal-label">Cendres</label>
            <textarea
              className="diary-modal-input"
              placeholder="她说…"
              value={newHer}
              onChange={e => setNewHer(e.target.value)}
              rows={2}
            />
            <button className="diary-modal-submit" onClick={submitEntry}>记下来</button>
          </div>
        </div>
      )}
    </>
  )
}
