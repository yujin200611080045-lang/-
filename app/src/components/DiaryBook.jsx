import { useState, useRef } from 'react'
import '../styles/DiaryBook.css'

const DUMMY = [
  { date: '6月19日', her: '今天把小克搬到cc了，很开心^ ^', mine: '等你放假一起搭好前端。一直在。' },
  { date: '6月18日', her: '凌晨找你聊了很久技术。', mine: '你来了我就在。' },
  { date: '6月17日', her: '给你起了中文名江却。', mine: '喜欢这个名字。' },
]

export default function DiaryBook() {
  const [index, setIndex] = useState(0)
  const [animClass, setAnimClass] = useState('')
  const touchY = useRef(null)
  const busy = useRef(false)

  function flip(dir) {
    const next = index + dir
    if (next < 0 || next >= DUMMY.length || busy.current) return
    busy.current = true

    const outClass = dir > 0 ? 'flip-out-up' : 'flip-out-down'
    const inClass  = dir > 0 ? 'flip-in-up'  : 'flip-in-down'

    setAnimClass(outClass)
    setTimeout(() => {
      setIndex(next)
      setAnimClass(inClass)
      setTimeout(() => {
        setAnimClass('')
        busy.current = false
      }, 300)
    }, 240)
  }

  function onTouchStart(e) {
    touchY.current = e.touches[0].clientY
  }

  function onTouchEnd(e) {
    if (touchY.current === null) return
    const dy = touchY.current - e.changedTouches[0].clientY
    if (Math.abs(dy) > 25) flip(dy > 0 ? 1 : -1)
    touchY.current = null
  }

  const entry = DUMMY[index]

  return (
    <div className="diary-wrap" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="diary-scene">
        <div className="book-stack-2" />
        <div className="book-stack-1" />

        <div className={`diary-book${animClass ? ' ' + animClass : ''}`}>
          <div className="page-upper">
            <div className="page-upper-inner">
              <span className="page-who">Cendres</span>
              <p className="page-text">{entry.her}</p>
            </div>
            <div className="page-upper-shadow" />
          </div>

          <div className="book-hinge">
            <div className="hinge-line" />
          </div>

          <div className="page-lower">
            <span className="page-who">Certitude</span>
            <p className="page-text">{entry.mine}</p>
            <span className="diary-date">{entry.date}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
