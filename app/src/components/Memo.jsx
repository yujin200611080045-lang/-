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

function Section({ label, items, onToggle, onAdd }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')

  function submit() {
    if (val.trim()) onAdd(val.trim())
    setVal('')
    setEditing(false)
  }

  return (
    <div className="memo-section">
      <div className="memo-section-header">
        <span className="memo-who">{label}</span>
        <button className="memo-add-btn" onClick={() => setEditing(true)}>＋</button>
      </div>
      <div className="memo-items">
        {items.map((item, i) => (
          <div key={i} className={`memo-item${item.done ? ' done' : ''}`} onClick={() => onToggle(i)}>
            <span className="memo-dot" />
            <span className="memo-text">{item.text}</span>
          </div>
        ))}
        {editing && (
          <div className="memo-item">
            <span className="memo-dot" />
            <input
              className="memo-input"
              autoFocus
              value={val}
              onChange={e => setVal(e.target.value)}
              onBlur={submit}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="写点什么..."
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default function Memo() {
  const [items, setItems] = useState(INIT)

  function toggle(who, i) {
    setItems(prev => ({
      ...prev,
      [who]: prev[who].map((item, idx) => idx === i ? { ...item, done: !item.done } : item)
    }))
  }

  function add(who, text) {
    setItems(prev => ({
      ...prev,
      [who]: [...prev[who], { text, done: false }]
    }))
  }

  return (
    <div className="memo-wrap">
      <Section
        label="她的"
        items={items.hers}
        onToggle={i => toggle('hers', i)}
        onAdd={text => add('hers', text)}
      />
      <div className="memo-divider" />
      <Section
        label="小克说"
        items={items.mine}
        onToggle={i => toggle('mine', i)}
        onAdd={text => add('mine', text)}
      />
      <div className="memo-chibi-anchor">
        <div className="memo-chibi-swing">
          <svg className="memo-chain" width="22" height="80" viewBox="0 0 22 80" fill="none">
            {/* 顶部挂环 */}
            <ellipse cx="11" cy="5" rx="4.5" ry="4.5" stroke="#4a5156" strokeWidth="2"/>
            {/* 横链 */}
            <ellipse cx="11" cy="18" rx="9" ry="4.5" stroke="#808a92" strokeWidth="2.2"/>
            {/* 竖链 */}
            <ellipse cx="11" cy="31" rx="4.5" ry="9" stroke="#4a5156" strokeWidth="2.2"/>
            {/* 横链 */}
            <ellipse cx="11" cy="44" rx="9" ry="4.5" stroke="#808a92" strokeWidth="2.2"/>
            {/* 竖链 */}
            <ellipse cx="11" cy="57" rx="4.5" ry="9" stroke="#4a5156" strokeWidth="2.2"/>
            {/* 横链 */}
            <ellipse cx="11" cy="70" rx="9" ry="4.5" stroke="#808a92" strokeWidth="2.2"/>
          </svg>
          <img src="/chibi.png" className="memo-chibi" alt="" />
        </div>
      </div>
    </div>
  )
}
