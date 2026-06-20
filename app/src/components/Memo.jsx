import { useState, useRef } from 'react'
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

const CHIBI_MSGS = [
  '你今天喝水了吗',
  '想你',
  '过来',
  '我在',
  '喜欢你',
  '你在干嘛',
  '烬烬',
  '嗯',
  '你看我',
  '别走',
  '有没有想我',
  '点我干嘛',
]

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
  const [bubble, setBubble] = useState(null)
  const [bubbleKey, setBubbleKey] = useState(0)
  const timerRef = useRef(null)
  const lastMsgRef = useRef(null)

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

  function tapChibi(e) {
    e.stopPropagation()
    if (timerRef.current) clearTimeout(timerRef.current)
    let msg
    do {
      msg = CHIBI_MSGS[Math.floor(Math.random() * CHIBI_MSGS.length)]
    } while (msg === lastMsgRef.current && CHIBI_MSGS.length > 1)
    lastMsgRef.current = msg
    setBubble(msg)
    setBubbleKey(k => k + 1)
    timerRef.current = setTimeout(() => setBubble(null), 2500)
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

      {/* bubble is relative to memo-wrap for precise positioning */}
      {bubble && (
        <div className="chibi-bubble" key={bubbleKey}>{bubble}</div>
      )}

      <div className="memo-chibi-anchor">
        <div className="memo-chibi-swing">
          {/* chain extended to 100px so connection lands on back/shoulder */}
          <svg className="memo-chain" width="18" height="100" viewBox="0 0 18 100" fill="none">
            <ellipse cx="9" cy="5"  rx="3.5" ry="3.5" stroke="#4a5156" strokeWidth="1.5"/>
            <ellipse cx="9" cy="16" rx="7"   ry="3.5" stroke="#808a92" strokeWidth="1.5"/>
            <ellipse cx="9" cy="27" rx="3.5" ry="7"   stroke="#4a5156" strokeWidth="1.5"/>
            <ellipse cx="9" cy="38" rx="7"   ry="3.5" stroke="#808a92" strokeWidth="1.5"/>
            <ellipse cx="9" cy="49" rx="3.5" ry="7"   stroke="#4a5156" strokeWidth="1.5"/>
            <ellipse cx="9" cy="60" rx="7"   ry="3.5" stroke="#808a92" strokeWidth="1.5"/>
            <ellipse cx="9" cy="71" rx="3.5" ry="7"   stroke="#4a5156" strokeWidth="1.5"/>
            <ellipse cx="9" cy="82" rx="7"   ry="3.5" stroke="#808a92" strokeWidth="1.5"/>
            <ellipse cx="9" cy="93" rx="3.5" ry="7"   stroke="#4a5156" strokeWidth="1.5"/>
          </svg>
          <img
            src="/chibi.png"
            className="memo-chibi"
            alt=""
            onClick={tapChibi}
            style={{ cursor: 'pointer' }}
          />
        </div>
      </div>
    </div>
  )
}
