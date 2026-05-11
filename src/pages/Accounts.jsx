import { useState, useMemo } from 'react'
import { useFetch } from '../hooks/useFetch'
import { useApi, fmt } from '../lib/api'

const TYPE_ORDER = ['checking','savings','investment','mortgage','credit']

function classifyAccount(acc) {
  const name = (acc.name || '').toLowerCase()
  const attrs = acc.attributes || []
  if (attrs.includes('LOAN') || name.includes('loan') || name.includes('mortgage') || name.includes('home loan')) return 'mortgage'
  if (name.includes('credit') || attrs.includes('CREDIT_CARD')) return 'credit'
  if (name.includes('invest') || name.includes('kiwisaver') || (acc.connection?.name||'').toLowerCase().includes('sharesies')) return 'investment'
  if (name.includes('sav')) return 'savings'
  return 'checking'
}

export default function Accounts() {
  const api = useApi()
  const { data, loading, error, refetch } = useFetch(api.accounts)
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  if (loading) return <div className="loading"><span className="dot-pulse">Loading accounts</span></div>
  if (error) return <div className="error-box">⚠ {error}</div>

  const accounts = (data?.items || []).map(a => ({ ...a, _type: classifyAccount(a) }))

  const handleEditStart = (acc) => {
    setEditingId(acc._id)
    setEditValue(acc._customName || acc.name)
  }

  const handleSaveName = async (accountId) => {
    if (!editValue.trim()) return
    setSaving(true)
    try {
      await fetch('/api/accounts/' + accountId + '/name', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customName: editValue })
      })
      setEditingId(null)
      refetch()
    } catch (err) {
      alert('Failed to save: ' + err.message)
    }
    setSaving(false)
  }

  const handleCancel = () => {
    setEditingId(null)
    setEditValue('')
  }
  const grouped = TYPE_ORDER.reduce((g, t) => {
    const items = accounts.filter(a => a._type === t)
    if (items.length) g[t] = items
    return g
  }, {})

  const totalAssets = accounts.filter(a => !['mortgage','credit'].includes(a._type)).reduce((s, a) => s + (a.balance?.current || 0), 0)
  const totalDebt = accounts.filter(a => ['mortgage','credit'].includes(a._type)).reduce((s, a) => s + Math.abs(a.balance?.current || 0), 0)

  return (
    <div className="page-fade">
      <div className="flex-between mb-24">
        <div>
          <div className="section-title">Accounts</div>
          <div className="section-sub">{accounts.length} connected accounts across {new Set(accounts.map(a => a.connection?.name)).size} institutions</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, color: 'var(--accent)' }}>{fmt(totalAssets)}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>total assets</div>
        </div>
      </div>

      <div className="grid-2 mb-24">
        <div className="stat-tile">
          <div className="stat-label">Total Assets</div>
          <div className="stat-value stat-up">{fmt(totalAssets)}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Total Debt</div>
          <div className="stat-value stat-down">{fmt(totalDebt)}</div>
          <div className="stat-sub">mortgages + credit cards</div>
        </div>
      </div>

      {Object.entries(grouped).map(([type, items]) => (
        <div key={type} className="card mb-16">
          <div className="flex-between mb-16">
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className={`account-badge badge-${type}`}>{type}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{items.length} account{items.length > 1 ? 's' : ''}</span>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>
              {fmt(items.reduce((s, a) => s + (a.balance?.current || 0), 0))}
            </span>
          </div>
          {items.map(acc => (
            <div className="account-row" key={acc._id}>
              <div>
                <div className="account-bank">{acc.connection?.name}</div>
                {editingId === acc._id ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, marginBottom: 4 }}>
                    <input
                      type="text"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      style={{
                        flex: 1,
                        background: 'var(--surface2)',
                        border: '1px solid var(--accent)',
                        borderRadius: 4,
                        color: 'var(--text)',
                        padding: '6px 8px',
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleSaveName(acc._id)
                        if (e.key === 'Escape') handleCancel()
                      }}
                    />
                    <button
                      onClick={() => handleSaveName(acc._id)}
                      disabled={saving}
                      style={{
                        background: 'var(--accent)',
                        color: 'var(--bg)',
                        border: 'none',
                        borderRadius: 4,
                        padding: '6px 12px',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 600,
                        opacity: saving ? 0.6 : 1,
                      }}
                    >
                      Save
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={saving}
                      style={{
                        background: 'var(--surface2)',
                        color: 'var(--muted)',
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                        padding: '6px 12px',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => handleEditStart(acc)}
                    style={{
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <div className="account-name">{acc._displayName || acc.name}</div>
                    {acc._customName && <span style={{ fontSize: 10, color: 'var(--accent2)', background: 'rgba(96,165,250,0.1)', padding: '2px 6px', borderRadius: 4 }}>custom</span>}
                    <span style={{ fontSize: 11, color: 'var(--border2)' }}>✎</span>
                  </div>
                )}
                <div className="account-num">{acc.formatted_account}</div>
                {acc.meta?.holder && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{acc.meta.holder}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className={`account-balance ${(acc.balance?.current || 0) < 0 ? 'negative' : ''}`}>
                  {fmt(acc.balance?.current || 0)}
                </div>
                {acc.balance?.available !== undefined && acc.balance.available !== acc.balance.current && (
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>avail {fmt(acc.balance.available)}</div>
                )}
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                  {acc.status === 'ACTIVE' ? '● live' : acc.status}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
