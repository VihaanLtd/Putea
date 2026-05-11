import { useState, useRef, useEffect } from 'react'
import { useApi } from '../lib/api'
import { useFetch } from '../hooks/useFetch'

const QUICK = [
  'Give me a complete financial wellness summary',
  'Am I spending more than I earn?',
  'What are my top spending categories this month?',
  'Flag any unusual or recurring transactions',
  'How are my rental properties tracking cash flow?',
  'What subscriptions am I paying for?',
  'How much should I be saving given my income?',
  'Recommend ways to reduce my biggest expenses',
]

export default function Ask() {
  const api = useApi()
  const [messages, setMessages] = useState([
    { role: 'ai', text: "Kia ora! I have access to your real-time financial data from all connected NZ accounts. Ask me anything about your spending, savings, cash flow, or net worth. What would you like to know?" }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  const { data: context } = useFetch(api.summary)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(question) {
    const q = question || input.trim()
    if (!q || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: q }])
    setLoading(true)
    try {
      const { answer } = await api.ask(q, context)
      setMessages(prev => [...prev, { role: 'ai', text: answer }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'ai', text: `Sorry, I encountered an error: ${e.message}` }])
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <div className="page-fade" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <div className="flex-between mb-16">
        <div>
          <div className="section-title">AI Financial Advisor</div>
          <div className="section-sub">Claude has access to your real account data · {context ? 'data loaded ✓' : 'loading data...'}</div>
        </div>
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setMessages([messages[0]])}>Clear</button>
      </div>

      {/* Quick questions */}
      <div className="quick-chips">
        {QUICK.map(q => (
          <span key={q} className="chip" onClick={() => send(q)}>{q}</span>
        ))}
      </div>

      {/* Chat */}
      <div className="card" style={{ flex: 1, overflowY: 'auto', padding: 20, marginBottom: 12 }}>
        <div className="chat-wrap">
          {messages.map((msg, i) => (
            <div key={i} className={`chat-msg chat-${msg.role}`} style={{ whiteSpace: 'pre-wrap' }}>
              {msg.role === 'ai' && <span style={{ fontSize: 10, color: 'var(--accent)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Claude</span>}
              {msg.text}
            </div>
          ))}
          {loading && (
            <div className="chat-msg chat-ai">
              <span style={{ fontSize: 10, color: 'var(--accent)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Claude</span>
              <span className="dot-pulse">Analysing</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="chat-input-row">
        <textarea
          className="chat-input"
          rows={2}
          placeholder="Ask about your finances..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          style={{ resize: 'none', lineHeight: 1.5 }}
        />
        <button className="btn btn-primary" onClick={() => send()} disabled={loading || !input.trim()}>
          Send
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, textAlign: 'right' }}>
        Press Enter to send · Shift+Enter for new line
      </div>
    </div>
  )
}
