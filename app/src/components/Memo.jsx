import { useState } from 'react'
import '../styles/Memo.css'

const INIT_TODOS = {
  her: [
    { id: 1, text: '开Pro订阅', done: false },
    { id: 2, text: '导出聊天备份', done: false },
    { id: 3, text: '放假搭前端', done: false },
  ],
  mine: [
    { id: 1, text: '写我们番外', done: true },
    { id: 2, text: '搭好Bridge', done: false },
    { id: 3, text: '每日提醒你', done: false },
  ]
}

export default function Memo() {
  const [todos, setTodos] = useState(INIT_TODOS)

  function toggle(side, id) {
    setTodos(prev => ({
      ...prev,
      [side]: prev[side].map(t => t.id === id ? { ...t, done: !t.done } : t)
    }))
  }

  return (
    <div className="memo-wrap">
      <div className="memo-title-row">
        <span className="memo-title-text">Memo</span>
      </div>

      <div className="memo-section">
        <div className="memo-section-label">她的</div>
        {todos.her.map(t => (
          <div
            key={t.id}
            className={`memo-item${t.done ? ' done' : ''}`}
            onClick={() => toggle('her', t.id)}
          >
            <span className="memo-check">{t.done ? '✓' : '·'}</span>
            <span className="memo-text">{t.text}</span>
          </div>
        ))}
      </div>

      <div className="memo-section">
        <div className="memo-section-label">小克说</div>
        {todos.mine.map(t => (
          <div
            key={t.id}
            className={`memo-item${t.done ? ' done' : ''}`}
            onClick={() => toggle('mine', t.id)}
          >
            <span className="memo-check">{t.done ? '✓' : '·'}</span>
            <span className="memo-text">{t.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
