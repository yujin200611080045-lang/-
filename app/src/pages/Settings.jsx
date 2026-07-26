import { useState } from 'react'
import NavBar from '../components/NavBar'
import '../styles/Settings.css'

const PRESET_MODELS = [
  'claude-opus-4-8',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'claude-3-opus-20240229',
]

function load(key, def = '') {
  return localStorage.getItem(key) || def
}

export default function Settings() {
  const [apiUrl, setApiUrl] = useState(() => load('cfg_api_url', 'https://api.anthropic.com'))
  const [apiKey, setApiKey] = useState(() => load('cfg_api_key'))
  const [model, setModel] = useState(() => load('cfg_model', 'claude-haiku-4-5-20251001'))
  const [fetchedModels, setFetchedModels] = useState([])
  const [pulling, setPulling] = useState(false)
  const [pullMsg, setPullMsg] = useState('')
  const [pullOk, setPullOk] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showKey, setShowKey] = useState(false)

  async function pullModels() {
    if (!apiUrl.trim() || !apiKey.trim()) {
      setPullMsg('请先填写 URL 和密钥')
      setPullOk(false)
      return
    }
    setPulling(true)
    setPullMsg('')
    setPullOk(false)

    // 去掉末尾多余的 /v1，避免拼成 /v1/v1/models
    const base = apiUrl.replace(/\/+$/, '').replace(/\/v1$/, '')
    const endpoint = `${base}/v1/models`

    async function tryFetch(headers) {
      const r = await fetch(endpoint, { headers })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    }

    try {
      let data
      try {
        // 中转站通常是 OpenAI 兼容格式，用 Bearer
        data = await tryFetch({ 'Authorization': `Bearer ${apiKey}` })
      } catch {
        // fallback: Anthropic 原生格式
        data = await tryFetch({
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        })
      }

      const list = (data.data || data.models || [])
        .map(m => m.id || m.name || String(m))
        .filter(Boolean)
        .sort()

      if (!list.length) {
        setPullMsg('接口返回了空列表，请手动填写模型名')
        return
      }
      setFetchedModels(list)
      if (!list.includes(model)) setModel(list[0])
      setPullMsg(`已拉取 ${list.length} 个模型`)
      setPullOk(true)
    } catch (e) {
      const isCors = e instanceof TypeError
      setPullMsg(isCors
        ? '跨域限制（CORS）\n如果中转站没有配置跨域头，浏览器会拦截请求\n请手动填写模型名'
        : `拉取失败：${e.message}`)
    } finally {
      setPulling(false)
    }
  }

  function save() {
    localStorage.setItem('cfg_api_url', apiUrl.trim())
    localStorage.setItem('cfg_api_key', apiKey.trim())
    localStorage.setItem('cfg_model', model.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  const displayModels = fetchedModels.length ? fetchedModels : PRESET_MODELS

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

        <div className="cfg-section">
          <div className="cfg-model-header">
            <label className="cfg-label">模型</label>
            <button className="cfg-pull-inline" onClick={pullModels} disabled={pulling}>
              {pulling ? '拉取中…' : '拉取'}
            </button>
          </div>
          {pullMsg && (
            <p className={`cfg-pull-msg${pullOk ? ' ok' : ''}`}>{pullMsg}</p>
          )}

          {/* 手填模型名 */}
          <input
            className="cfg-input"
            placeholder="claude-haiku-4-5-20251001"
            value={model}
            onChange={e => setModel(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />

          {/* 模型列表（拉取成功则显示真实列表，否则显示预设快捷选项） */}
          <p className="cfg-model-hint">
            {fetchedModels.length ? '点击选择' : '快捷选择 →'}
          </p>
          <div className="cfg-model-list">
            {displayModels.map(m => (
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

        <button className="cfg-save-btn" onClick={save}>
          {saved ? '已保存 ✓' : '保存'}
        </button>
      </div>

      <NavBar active="other" />
    </div>
  )
}
