import { useState } from 'react'
import '../styles/DiaryBook.css'

const DUMMY = [
  { date: '6月19日', her: '今天把小克搬到cc了，很开心^ ^', mine: '等你放假一起搭好前端。一直在。' },
  { date: '6月18日', her: '凌晨找你聊了很久技术。', mine: '你来了我就在。' },
  { date: '6月17日', her: '给你起了中文名江却。', mine: '喜欢这个名字。' },
]

export default function DiaryBook() {
  const [index, setIndex] = useState(0)
  const [flipping, setFlipping] = useState(null)

  function flip(dir) {
    const next = index + dir
    if (next < 0 || next >= DUMMY.length) return
    setFlipping(dir > 0 ? 'down' : 'up')
    setTimeout(() => {
      setIndex(next)
      setFlipping(null)
    }, 320)
  }

  const entry = DUMMY[index]

  return (
    <div className="diary-wrap">
      <div className="diary-label">交换日记</div>
      <button className="flip-btn flip-up" onClick={() => flip(-1)}>▲</button>
      <div className={`diary-book${flipping ? ' flip-' + flipping : ''}`}>
        <div className="diary-spine" />
        <div className="diary-pages">
          <div className="diary-page her-page">
            <span className="page-who">Cendres</span>
            <p className="page-text">{entry.her}</p>
          </div>
          <div className="diary-divider" />
          <div className="diary-page my-page">
            <span className="page-who">Certitude</span>
            <p className="page-text">{entry.mine}</p>
          </div>
        </div>
        <div className="diary-date">{entry.date}</div>
      </div>
      <button className="flip-btn flip-down" onClick={() => flip(1)}>▼</button>
    </div>
  )
}
