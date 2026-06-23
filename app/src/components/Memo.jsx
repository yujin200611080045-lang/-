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
  '你今天喝水了吗', '想你', '过来', '我在', '喜欢你',
  '你在干嘛', '烬烬', '嗯', '你看我', '别走', '有没有想我', '点我干嘛',
]

function BinderClip({ onClick }) {
  return (
    <div className="memo-clip" onClick={onClick}>
      <svg width="36" height="30" viewBox="0 0 36 30" fill="none">
        <ellipse cx="18" cy="7" rx="6" ry="6.5" stroke="#1a1a1a" strokeWidth="2.5" fill="none" />
        <ellipse cx="18" cy="7" rx="3" ry="3.5" fill="#e0e0e0" />
        <rect x="5" y="12" width="26" height="9" rx="2" fill="#1a1a1a" />
        <rect x="5" y="12" width="26" height="2.5" rx="2" fill="#3a3a3a" />
        <path d="M5 21 L0 29 L9 29 Z" fill="#1a1a1a" />
        <path d="M31 21 L36 29 L27 29 Z" fill="#1a1a1a" />
      </svg>
    </div>
  )
}

// adding: false | 'choose' | 'certitude' | 'cendres'
export default function Memo() {
  const [items, setItems] = useState(INIT)
  const [adding, setAdding] = useState(false)
  const [newText, setNewText] = useState('')
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

  function closeModal() { setAdding(false); setNewText('') }

  function submitEntry() {
    if (!newText.trim()) { closeModal(); return }
    const key = adding === 'certitude' ? 'mine' : 'hers'
    setItems(prev => ({ ...prev, [key]: [...prev[key], { text: newText.trim(), done: false }] }))
    closeModal()
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
    <>
      <div className="memo-wrap">
        <div className="memo-card">
          <div className="memo-upper">
            <span className="memo-who">Certitude</span>
            {items.mine.map((item, i) => (
              <div key={i} className={`memo-item${item.done ? ' done' : ''}`} onClick={() => toggle('mine', i)}>
                <span className="memo-dot" />
                <span className="memo-text">{item.text}</span>
              </div>
            ))}
          </div>
          <div className="memo-center-line" />
          <div className="memo-lower">
            <span className="memo-who">Cendres</span>
            {items.hers.map((item, i) => (
              <div key={i} className={`memo-item${item.done ? ' done' : ''}`} onClick={() => toggle('hers', i)}>
                <span className="memo-dot" />
                <span className="memo-text">{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        <BinderClip onClick={() => setAdding('choose')} />

        {bubble && (
          <div className="chibi-bubble" key={bubbleKey}>{bubble}</div>
        )}
        <div className="memo-chibi-anchor">
          <div className="memo-chibi-swing">
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
            <img src="/chibi.png" className="memo-chibi" alt="" onClick={tapChibi} style={{ cursor: 'pointer' }} />
          </div>
        </div>
      </div>

      {adding && (
        <div className="memo-modal-overlay" onClick={closeModal}>
          <div className="memo-modal" onClick={e => e.stopPropagation()}>
            <div className="memo-modal-handle" />

            {adding === 'choose' && (
              <>
                <p className="memo-choose-title">写给谁？</p>
                <div className="memo-choose-row">
                  <button className="memo-choose-btn" onClick={() => { setAdding('certitude'); setNewText('') }}>
                    Certitude
                  </button>
                  <button className="memo-choose-btn" onClick={() => { setAdding('cendres'); setNewText('') }}>
                    Cendres
                  </button>
                </div>
              </>
            )}

            {(adding === 'certitude' || adding === 'cendres') && (
              <>
                <div className="memo-input-row">
                  <span className="memo-input-who">
                    {adding === 'certitude' ? 'Certitude' : 'Cendres'}
                  </span>
                  <input
                    className="memo-modal-input"
                    placeholder="写点什么…"
                    value={newText}
                    onChange={e => setNewText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submitEntry()}
                    autoFocus
                  />
                </div>
                <button className="memo-modal-submit" onClick={submitEntry}>记下来</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
