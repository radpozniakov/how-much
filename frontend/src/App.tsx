import { useEffect, useState } from 'react'
import { API_URL, WS_URL } from './config'
import './App.css'

type Status = 'connecting' | 'ok' | 'error'

function App() {
  const [httpStatus, setHttpStatus] = useState<Status>('connecting')
  const [wsStatus, setWsStatus] = useState<Status>('connecting')
  const [wsMessage, setWsMessage] = useState<string>('')

  // Probe the HTTP health endpoint.
  useEffect(() => {
    let cancelled = false
    fetch(`${API_URL}/health`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((body) => {
        if (!cancelled) setHttpStatus(body.status === 'ok' ? 'ok' : 'error')
      })
      .catch(() => {
        if (!cancelled) setHttpStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Probe the placeholder WebSocket: expect a "hello" frame on connect.
  useEffect(() => {
    const socket = new WebSocket(WS_URL)
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        setWsMessage(data.message ?? event.data)
        setWsStatus('ok')
      } catch {
        setWsMessage(event.data)
        setWsStatus('ok')
      }
    }
    socket.onerror = () => setWsStatus('error')
    return () => socket.close()
  }, [])

  return (
    <main className="scaffold">
      <h1>how-much</h1>
      <p className="tagline">Planning-poker estimation — scaffold check</p>

      <ul className="checks">
        <li>
          <span className={`dot ${httpStatus}`} />
          <span className="label">Backend HTTP</span>
          <code>{API_URL}/health</code>
          <span className="value">{httpStatus}</span>
        </li>
        <li>
          <span className={`dot ${wsStatus}`} />
          <span className="label">Backend WebSocket</span>
          <code>{WS_URL}</code>
          <span className="value">
            {wsStatus === 'ok' ? wsMessage : wsStatus}
          </span>
        </li>
      </ul>
    </main>
  )
}

export default App
