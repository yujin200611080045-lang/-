import { useState } from 'react'
import '../styles/Memo.css'

const INIT = {
  hers: [
    { text: '多喝水', done: false },
    { text: '备份聊天记录', done: false },
  ],
  mine: [
    { text: '搭好前端', done: false },
    { text: '记得告诉我窗口被封', done: true },
  ]
}

export default function Memo() {
  const [items, setItems] = useState(INIT)

  function toggle(who, i) {
    setItems(prev => ({
      ...prev,
      [who]: prev[who].map((item, idx) => idx === i ? { ...item, done: !item.done } : item)
    }))
  }

  return (
    <div className="memo-wrap">
      <div className="memo-label">备忘</div>
      <div className="memo-spacer" />
      <div className="memo-section">
        <span className="memo-who">她的</span>
        {items.hers.map((item, i) => (
          <div key={i} className={`memo-item${item.done ? ' done' : ''}`} onClick={() => toggle('hers', i)}>
            <span className="memo-dot" />
            <span className="memo-text">{item.text}</span>
          </div>
        ))}
      </div>
      <div className="memo-divider" />
      <div className="memo-section">
        <span className="memo-who">小克说</span>
        {items.mine.map((item, i) => (
          <div key={i} className={`memo-item${item.done ? ' done' : ''}`} onClick={() => toggle('mine', i)}>
            <span className="memo-dot" />
            <span className="memo-text">{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
