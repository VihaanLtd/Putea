import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useFetch } from '../hooks/useFetch'
import { useApi, fmt, fmtDate } from '../lib/api'
import { useAuth } from '@clerk/clerk-react'
import { CATEGORY_GROUPS, getCategoryGroup } from '../lib/categories'

function CategoryBadge({ tx, allCategories, onSaved }) {
  const api = useApi()
  const [editing, setEditing]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [selected, setSelected] = useState('')
  const selectRef = useRef(null)

  const akahuCat = tx.category?.groups?.personal_finance?.name || tx.category?.name
  const category = tx.manual_category || tx.ai_category || akahuCat || 'Uncategorised'
  const isManual = !!tx.manually_categorised
  const isAi     = !isManual && !!tx.ai_categorised
  const isAkahuOverride = isManual && !!akahuCat

  const group = getCategoryGroup(category)

  function startEdit(e) {
    e.stopPropagation()
    setSelected(category === 'Uncategorised' ? '' : category)
    setEditing(true)
    setTimeout(() => selectRef.current?.focus(), 0)
  }

  // tx._internal transactions show "own transfer" badge instead, not editable
  if (tx._internal) return null

  async function save(e) {
    e.stopPropagation()
    if (!selected) { setEditing(false); return }
    setSaving(true)
    try {
      const result = await api.patchCategory(tx._id, selected)
      onSaved(tx._id, tx.description, selected, result.updated)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  function cancel(e) { e.stopPropagation(); setEditing(false) }

  if (editing) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
        <select
          ref={selectRef}
          value={selected}
          onChange={e => setSelected(e.target.value)}
          style={{
            background: 'var(--surface2)', border: '1px solid var(--accent)', borderRadius: 4,
            color: 'var(--text)', fontSize: 11, padding: '2px 6px', cursor: 'pointer',
          }}
        >
          <option value="">— pick category —</option>
          {CATEGORY_GROUPS.map(g => (
            <optgroup key={g.label} label={`── ${g.label} ──`}>
              {g.categories.filter(c => allCategories.includes(c) || g.categories.includes(c)).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          onClick={save}
          disabled={saving || !selected}
          style={{ fontSize: 10, padding: '2px 7px', background: 'var(--accent)', color: '#0a1a12', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}
        >
          {saving ? '…' : 'Save'}
        </button>
        <button
          onClick={cancel}
          style={{ fontSize: 10, padding: '2px 6px', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}
        >
          ✕
        </button>
      </span>
    )
  }

  const groupStyle = group
    ? { background: group.bg, color: group.color, border: `1px solid ${group.border}` }
    : { opacity: 0.5 }

  return (
    <span
      className="tx-cat"
      title={isAkahuOverride ? `Overrides bank category "${akahuCat}" — click to change` : 'Click to edit category'}
      onClick={startEdit}
      style={{ ...groupStyle, cursor: 'pointer' }}
    >
      {isManual && <span style={{ marginRight: 3, fontSize: 9 }}>✎</span>}
      {isAi && !isManual && <span style={{ marginRight: 3, fontSize: 9 }}>✦</span>}
      {category}
      <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.5 }}>✎</span>
    </span>
  )
}

function localDateStr(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getDateRange(preset) {
  if (preset === 'all') return { start: null, end: null }
  const now = new Date()
  const end = localDateStr(now)
  const d = new Date(now)
  if (preset === '7d')       d.setDate(d.getDate() - 7)
  else if (preset === '30d') d.setDate(d.getDate() - 30)
  else if (preset === '90d') d.setDate(d.getDate() - 90)
  else if (preset === '1y')  d.setFullYear(d.getFullYear() - 1)
  else if (preset === '2y')  d.setFullYear(d.getFullYear() - 2)
  return { start: localDateStr(d), end }
}

export default function Transactions() {
  const [searchParams] = useSearchParams()

  const [range, setRange]               = useState(searchParams.get('range') || '30d')
  const [search, setSearch]             = useState('')
  const [typeFilter, setTypeFilter]     = useState(searchParams.get('type') || 'all')
  const [accountFilter, setAccountFilter] = useState(searchParams.get('account') || 'all')
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('category') || '')
  const [hideTransfers, setHideTransfers] = useState(true)
  const [syncing, setSyncing]           = useState(false)
  const [syncMsg, setSyncMsg]           = useState('')
  const [categorising, setCategorising] = useState(false)
  const [catMsg, setCatMsg]             = useState('')

  // Re-apply filters when navigating here from Dashboard
  useEffect(() => {
    const r = searchParams.get('range')
    const t = searchParams.get('type')
    const a = searchParams.get('account')
    const c = searchParams.get('category')
    if (r) setRange(r)
    if (t) setTypeFilter(t)
    if (a) setAccountFilter(a)
    if (c) setCategoryFilter(c)
  }, [searchParams])

  const api = useApi()
  const { getToken } = useAuth()
  const { start, end } = getDateRange(range)
  const { data, loading, error, refresh } = useFetch(
    () => api.transactions(start, end),
    [range, start, end]
  )
  const { data: accountsData } = useFetch(api.accounts)
  const { data: syncStatus }  = useFetch(api.syncStatus)
  const { data: categoryList } = useFetch(api.categories)

  async function doCategorise() {
    setCategorising(true)
    setCatMsg('')
    try {
      const result = await api.categorise()
      if (result.categorised === 0) setCatMsg('Nothing new to categorise')
      else setCatMsg(`✦ Claude categorised ${result.categorised} transactions`)
      refresh?.()
    } catch (e) {
      setCatMsg(`Failed: ${e.message}`)
    } finally {
      setCategorising(false)
    }
  }

  // Optimistic update — apply to every visible row with the same description
  const [localOverrides, setLocalOverrides] = useState({})
  const [saveToast, setSaveToast] = useState('')

  function handleCategorySaved(id, description, category, updatedCount) {
    setLocalOverrides(prev => {
      const next = { ...prev }
      // Mark every visible transaction with the same description
      ;(data?.items || []).forEach(tx => {
        if (tx.description === description) next[tx._id] = category
      })
      return next
    })
    const msg = updatedCount > 1
      ? `✎ "${category}" applied to ${updatedCount} transactions`
      : `✎ Category saved`
    setSaveToast(msg)
    setTimeout(() => setSaveToast(''), 4000)
  }

  const allCategories = categoryList || []

  async function doSync() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const token = await getToken()
      const res = await fetch('/api/sync', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      const result = await res.json()
      if (result.skipped) setSyncMsg('Already up to date')
      else setSyncMsg(`Synced — ${result.inserted} new transactions added`)
      refresh?.()
    } catch (e) {
      setSyncMsg(`Sync failed: ${e.message}`)
    } finally {
      setSyncing(false)
    }
  }

  const accounts = accountsData?.items || []

  const txs = (data?.items || []).filter(tx => {
    const matchSearch = !search ||
      (tx.description || '').toLowerCase().includes(search.toLowerCase()) ||
      (tx.merchant?.name || '').toLowerCase().includes(search.toLowerCase())
    const matchType     = typeFilter === 'all' || (typeFilter === 'credit' ? tx.amount > 0 : tx.amount < 0)
    const matchAccount  = accountFilter === 'all' || tx._account === accountFilter
    const matchTransfer = !hideTransfers || !tx._internal
    const txCat = tx.manual_category || tx.category?.groups?.personal_finance?.name || tx.category?.name || tx.ai_category || 'Uncategorised'
    const matchCategory = !categoryFilter || txCat === categoryFilter
    return matchSearch && matchType && matchAccount && matchTransfer && matchCategory
  })

  const allTxs      = data?.items || []
  const transferCount = allTxs.filter(t => t._internal).length

  const totalIn = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const totalOut = txs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)

  return (
    <div className="page-fade">
      <div className="flex-between mb-24">
        <div>
          <div className="section-title">Transactions</div>
          <div className="section-sub">
            External transactions only · internal transfers excluded from totals
            {syncStatus?.lastSync && (
              <span style={{ marginLeft: 10, color: 'var(--accent)' }}>
                · last sync {fmtDate(syncStatus.lastSync)} · {syncStatus.totalTransactions} stored
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {saveToast && <span style={{ fontSize: 12, color: 'var(--gold)', transition: 'opacity 0.3s' }}>{saveToast}</span>}
          {catMsg && <span style={{ fontSize: 12, color: catMsg.includes('Failed') ? 'var(--danger)' : 'var(--accent)' }}>{catMsg}</span>}
          {syncMsg && <span style={{ fontSize: 12, color: syncMsg.includes('failed') ? 'var(--danger)' : 'var(--accent)' }}>{syncMsg}</span>}
          {syncStatus?.uncategorised > 0 && (
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12, borderColor: 'rgba(155,93,229,0.4)', color: '#c084fc' }}
              onClick={doCategorise}
              disabled={categorising}
              title={`${syncStatus.uncategorised} transactions have no category`}
            >
              {categorising
                ? <span className="dot-pulse">Claude is thinking</span>
                : `✦ AI categorise (${syncStatus.uncategorised})`}
            </button>
          )}
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={doSync} disabled={syncing}>
            {syncing ? <span className="dot-pulse">Syncing</span> : '↻ Sync now'}
          </button>
        </div>
      </div>

      {/* Active filter chips */}
      {(categoryFilter || typeFilter !== 'all' || accountFilter !== 'all') && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {categoryFilter && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'rgba(52,211,153,0.12)', color: 'var(--accent)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 20, padding: '4px 12px' }}>
              Category: {categoryFilter}
              <span style={{ cursor: 'pointer', fontWeight: 700 }} onClick={() => setCategoryFilter('')}>×</span>
            </span>
          )}
          {typeFilter !== 'all' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'rgba(96,165,250,0.12)', color: 'var(--accent2)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 20, padding: '4px 12px' }}>
              {typeFilter === 'credit' ? 'Income only' : 'Expenses only'}
              <span style={{ cursor: 'pointer', fontWeight: 700 }} onClick={() => setTypeFilter('all')}>×</span>
            </span>
          )}
          {accountFilter !== 'all' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'rgba(251,191,36,0.12)', color: 'var(--gold)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 20, padding: '4px 12px' }}>
              {accounts.find(a => a._id === accountFilter)?.name || 'Account'}
              <span style={{ cursor: 'pointer', fontWeight: 700 }} onClick={() => setAccountFilter('all')}>×</span>
            </span>
          )}
          <span
            style={{ fontSize: 11, color: 'var(--muted)', cursor: 'pointer', padding: '4px 8px', alignSelf: 'center' }}
            onClick={() => { setCategoryFilter(''); setTypeFilter('all'); setAccountFilter('all') }}
          >
            Clear all
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="card mb-16" style={{ padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="chat-input"
            style={{ flex: 1, minWidth: 200, padding: '8px 12px' }}
            placeholder="Search merchant or description..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          {/* Account filter */}
          <select
            value={accountFilter}
            onChange={e => setAccountFilter(e.target.value)}
            style={{
              background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6,
              color: 'var(--text)', padding: '8px 12px', fontSize: 12, cursor: 'pointer',
              minWidth: 160,
            }}
          >
            <option value="all">All accounts</option>
            {accounts.map(acc => (
              <option key={acc._id} value={acc._id}>
                {acc.connection?.name} · {acc.name}
              </option>
            ))}
          </select>

          <div className="tabs" style={{ marginBottom: 0, borderBottom: 'none', gap: 4 }}>
            {['all', 'credit', 'debit'].map(t => (
              <div key={t} className={`tab ${typeFilter === t ? 'active' : ''}`} onClick={() => setTypeFilter(t)}>
                {t === 'all' ? 'All' : t === 'credit' ? 'In' : 'Out'}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { key: '7d',  label: '7d' },
              { key: '30d', label: '30d' },
              { key: '90d', label: '90d' },
              { key: '1y',  label: '1y' },
              { key: '2y',  label: '2y' },
              { key: 'all', label: 'All' },
            ].map(({ key, label }) => (
              <button key={key} className={`btn ${range === key ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setRange(key)}>
                {label}
              </button>
            ))}
          </div>

          <button
            className={`btn ${hideTransfers ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding: '6px 12px', fontSize: 12, whiteSpace: 'nowrap' }}
            onClick={() => setHideTransfers(h => !h)}
            title="Transfers between your own accounts"
          >
            {hideTransfers ? `Hide transfers (${transferCount})` : `Show transfers (${transferCount})`}
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid-3 mb-16">
        <div className="stat-tile" style={{ padding: '12px 16px' }}>
          <div className="stat-label">Total In</div>
          <div className="stat-value stat-up" style={{ fontSize: 18 }}>{fmt(totalIn)}</div>
        </div>
        <div className="stat-tile" style={{ padding: '12px 16px' }}>
          <div className="stat-label">Total Out</div>
          <div className="stat-value stat-down" style={{ fontSize: 18 }}>{fmt(totalOut)}</div>
        </div>
        <div className="stat-tile" style={{ padding: '12px 16px' }}>
          <div className="stat-label">Net</div>
          <div className={`stat-value ${totalIn - totalOut >= 0 ? 'stat-up' : 'stat-down'}`} style={{ fontSize: 18 }}>{fmt(totalIn - totalOut)}</div>
        </div>
      </div>

      {/* Transaction table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading && <div className="loading" style={{ padding: 32 }}><span className="dot-pulse">Fetching transactions</span></div>}
        {error && <div className="error-box" style={{ margin: 16 }}>⚠ {error}</div>}
        {!loading && !error && (
          <>
            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '90px 1fr 1fr 120px 120px',
              gap: 0,
              padding: '10px 20px',
              background: 'var(--surface2)',
              borderBottom: '1px solid var(--border)',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--muted)',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}>
              <div>Date</div>
              <div>Description</div>
              <div>Account</div>
              <div style={{ textAlign: 'right', color: 'var(--danger)' }}>Debit (Out)</div>
              <div style={{ textAlign: 'right', color: 'var(--accent)' }}>Credit (In)</div>
            </div>

            {txs.length === 0 && (
              <div style={{ color: 'var(--muted)', fontSize: 13, padding: '24px 20px' }}>No transactions found.</div>
            )}

            {[...txs].sort((a, b) => new Date(b.date) - new Date(a.date)).map((tx, i) => {
              const acct = accounts.find(a => a._id === tx._account)
              const isCredit = tx.amount > 0
              // Apply optimistic local override if user just saved
              const txWithOverride = localOverrides[tx._id]
                ? { ...tx, manual_category: localOverrides[tx._id], manually_categorised: true }
                : tx
              return (
                <div
                  key={tx._id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '90px 1fr 1fr 120px 120px',
                    gap: 0,
                    padding: '11px 20px',
                    borderBottom: '1px solid var(--border)',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                    alignItems: 'center',
                    fontSize: 13,
                  }}
                >
                  {/* Date */}
                  <div style={{ color: 'var(--muted)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtDate(tx.date)}
                  </div>

                  {/* Description */}
                  <div style={{ paddingRight: 12 }}>
                    <div style={{ fontWeight: 500, color: 'var(--text)', lineHeight: 1.3 }}>
                      {tx.merchant?.name || tx.description}
                    </div>
                    {tx.merchant?.name && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{tx.description}</div>
                    )}
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 3 }}>
                      {tx._internal && (
                        <span style={{ fontSize: 10, color: 'var(--muted)', background: 'rgba(107,117,133,0.15)', borderRadius: 3, padding: '1px 5px', border: '1px solid var(--border2)' }}>
                          own transfer
                        </span>
                      )}
                      {!tx._internal && (
                        <CategoryBadge
                          tx={txWithOverride}
                          allCategories={allCategories}
                          onSaved={handleCategorySaved}
                        />
                      )}
                    </div>
                  </div>

                  {/* Account */}
                  <div style={{ paddingRight: 12 }}>
                    {acct ? (
                      <>
                        <div style={{ fontSize: 12, color: 'var(--text)' }}>{acct.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{acct.connection?.name}</div>
                      </>
                    ) : '—'}
                  </div>

                  {/* Debit */}
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                    {!isCredit && (
                      <span style={{ color: 'var(--danger)' }}>{fmt(Math.abs(tx.amount))}</span>
                    )}
                  </div>

                  {/* Credit */}
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                    {isCredit && (
                      <span style={{ color: 'var(--accent)' }}>{fmt(tx.amount)}</span>
                    )}
                  </div>
                </div>
              )
            })}

            {txs.length > 0 && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: '90px 1fr 1fr 120px 120px',
                padding: '10px 20px',
                background: 'var(--surface2)',
                borderTop: '2px solid var(--border)',
                fontSize: 12,
                fontWeight: 600,
              }}>
                <div style={{ gridColumn: '1 / 4', color: 'var(--muted)' }}>{txs.length} transactions</div>
                <div style={{ textAlign: 'right', color: 'var(--danger)', fontFamily: 'var(--font-mono)' }}>{fmt(totalOut)}</div>
                <div style={{ textAlign: 'right', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{fmt(totalIn)}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
