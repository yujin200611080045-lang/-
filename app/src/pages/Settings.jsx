import { useState, useEffect } from 'react'
import NavBar from '../components/NavBar'
import '../styles/Settings.css'

function load(key, def = '') {
  return localStorage.getItem(key) || def
}

export default function Settings() {
  const [apiUrl, setApiUrl] = useState(() => load('cfg_api_url', 'https://api.anthropic.com'))
  const [apiKey, setApiKey] = useState(() => load('cfg_api_key'))
  const [model, setModel] = useState(() => load('cfg_model'))
  const [models, setModels] = useState([])
  const [pulling, setPulling] = useState(false)
  const [pullMsg, setPullMsg] = useState('')
  const [saved, setSaved] = useState(false)
  const [showKey, setShowKey] = useState(false)

  async function pullModels() {
    if (!apiUrl.trim() || !apiKey.trim()) {
      setPullMsg('请先填写 URL 和密钥')
      return
    }
    setPulling(true)
    setPullMsg('')
    try {
      const base = apiUrl.replace(/\/$/, '')
      // try Anthropic header format
      let resp = await fetch(`${base}/v1/models`, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      })
      if (!resp.ok) {
        // fallback: OpenAI Bearer format
        resp = await fetch(`${base}/v1/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        })
      }
      const data = await resp.json()
      const list = (data.data || data.models || [])
        .map(m => m.id || m.name || String(m))
        .filter(Boolean)
      if (!list.length) { setPullMsg('未获取到模型列表'); setPulling(false); return }
      setModels(list)
      if (!model || !list.includes(model)) setModel(list[0])
      setPullMsg(`已拉取 ${list.length} 个模型`)
    } catch (e) {
      setPullMsg('拉取失败：' + e.message)
    } finally {
      setPulling(false)
    }
  }

  function save() {
    localStorage.setItem('cfg_api_url', apiUrl.trim())
    localStorage.setItem('cfg_api_key', apiKey.trim())
    if (model) localStorage.setItem('cfg_model', model)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <span className="settings-title">other</span>
      </div>

      <div className="settings-body">
        <div className="cfg-section">
          <label className="cfg-label">API 地址</label>
          <input
            className="cfg-input"
            placeholder="https://api.anthropic.com"
            value={apiUrl}
            onChange={e => setApiUrl(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        <div className="cfg-section">
          <label className="cfg-label">密钥</label>
          <div className="cfg-key-row">
            <input
              className="cfg-input cfg-key-input"
              placeholder="sk-ant-..."
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <button className="cfg-eye" onClick={() => setShowKey(v => !v)}>
              {showKey
                ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              }
            </button>
          </div>
        </div>

        <button className="cfg-pull-btn" onClick={pullModels} disabled={pulling}>
          {pulling ? '拉取中…' : '拉取模型'}
        </button>
        {pullMsg && <p className="cfg-pull-msg">{pullMsg}</p>}

        {models.length > 0 && (
          <div className="cfg-section">
            <label className="cfg-label">选择模型</label>
            <div className="cfg-model-list">
              {models.map(m => (
                <button
                  key={m}
                  className={`cfg-model-item${model === m ? ' active' : ''}`}
                  onClick={() => setModel(m)}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

        {model && models.length === 0 && (
          <div className="cfg-section">
            <label className="cfg-label">当前模型</label>
            <p className="cfg-current-model">{model}</p>
          </div>
        )}

        <button className="cfg-save-btn" onClick={save}>
          {saved ? '已保存 ✓' : '保存'}
        </button>
      </div>

      <NavBar active="other" />
    </div>
  )
}
