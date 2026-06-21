import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SHARED_BOOKS } from '../components/LyricWidget'
import '../styles/Books.css'

const INIT = [
  { title: '唯一解', author: '', cover: null },
  ...SHARED_BOOKS.map(title => ({ title, author: '', cover: null })),
]

export default function Books() {
  const navigate = useNavigate()
  const [books, setBooks] = useState(INIT)
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newAuthor, setNewAuthor] = useState('')

  function addBook() {
    if (!newTitle.trim()) { setAdding(false); return }
    setBooks(prev => [...prev, { title: newTitle.trim(), author: newAuthor.trim(), cover: null }])
    setNewTitle('')
    setNewAuthor('')
    setAdding(false)
  }

  return (
    <div className="books-page">
      <div className="books-header">
        <button className="books-back" onClick={() => navigate('/')}>‹</button>
        <span className="books-title-word">reading</span>
        <button className="books-add-icon" onClick={() => setAdding(true)}>＋</button>
      </div>

      <div className="books-list">
        {books.map((book, i) => (
          <div key={i} className="book-card">
            <div className="book-cover">
              {book.cover
                ? <img src={book.cover} alt="" />
                : <div className="book-cover-inner"><span className="book-cover-title">{book.title}</span></div>
              }
            </div>
            <div className="book-meta">
              <div className="book-name">{book.title}</div>
              {book.author && <div className="book-author">{book.author}</div>}
            </div>
          </div>
        ))}
      </div>

      {adding && (
        <div className="books-modal-overlay" onClick={() => setAdding(false)}>
          <div className="books-modal" onClick={e => e.stopPropagation()}>
            <div className="books-modal-handle" />
            <p className="books-modal-title">加书单</p>
            <input
              className="books-modal-input"
              placeholder="书名"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              autoFocus
            />
            <input
              className="books-modal-input"
              placeholder="作者（选填）"
              value={newAuthor}
              onChange={e => setNewAuthor(e.target.value)}
            />
            <button className="books-modal-submit" onClick={addBook}>加进来</button>
          </div>
        </div>
      )}
    </div>
  )
}
