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
    setTimeout(() => { setIndex(next); setFlipping(null) }, 400)
  }

  const entry = DUMMY[index]

  return (
    <div className="diary-wrap">
      <div className="diary-label">交换日记</div>
      <button className="flip-btn" onClick={() => flip(-1)} disabled={index === 0}>▲</button>

      <div className="diary-scene">
        <div className="book-stack-2" />
        <div className="book-stack-1" />

        <div className={`diary-book${flipping ? ' flipping' : ''}`}>

          {/* 上半页：掘起倾斜 */}
          <div className="page-upper">
            <div className="page-upper-inner">
              <span className="page-who">Cendres</span>
              <p className="page-text">{entry.her}</p>
            </div>
            <div className="page-upper-shadow" />
          </div>

          {/* 书脊折痕 */}
          <div className="book-hinge">
            <div className="hinge-line" />
          </div>

          {/* 下半页：平摔 */}
          <div className="page-lower">
            <span className="page-who">Certitude</span>
            <p className="page-text">{entry.mine}</p>
            <span className="diary-date">{entry.date}</span>
          </div>

        </div>
      </div>

      <button className="flip-btn" onClick={() => flip(1)} disabled={index === DUMMY.length - 1}>▼</button>
    </div>
  )
}
