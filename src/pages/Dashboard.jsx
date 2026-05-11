import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFetch } from '../hooks/useFetch'
import { useApi, fmt } from '../lib/api'
import { PieChart, Pie, Cell, Tooltip } from 'recharts'
import { getCategoryGroup } from '../lib/categories'

function PieTooltip({ active, payload, total }) {
  if (!active || !payload?.length) return null
  const { category, amount, count } = payload[0].payload
  const pct = total > 0 ? (amount / total * 100).toFixed(1) : 0
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '10px 14px',
      fontSize: 13,
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      minWidth: 180,
    }}>
      <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6, lineHeight: 1.3 }}>{category}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: 3 }}>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>Amount</span>
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--danger)' }}>{fmt(amount)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: 3 }}>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>Share</span>
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{pct}%</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24 }}>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>Transactions</span>
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{count}</span>
      </div>
    </div>
  )
}

const RANGE_OPTIONS = [
  { key: '7d',  label: '7d',   days: 7   },
  { key: '30d', label: '30d',  days: 30  },
  { key: '90d', label: '90d',  days: 90  },
  { key: '1y',  label: '1 yr', days: 365 },
  { key: '2y',  label: '2 yr', days: 730 },
  { key: 'all', label: 'All',  days: null },
]

function rangeToParams(key) {
  const opt = RANGE_OPTIONS.find(r => r.key === key)
  if (!opt || !opt.days) return { start: null, end: null }
  const end   = new Date()
  const start = new Date(end - opt.days * 86400000)
  return {
    start: start.toISOString().split('T')[0],
    end:   end.toISOString().split('T')[0],
  }
}

const COLORS = ['#00c896','#0099ff','#e9c46a','#f4a261','#ff4d6d','#9b5de5','#00bbf9','#fee440']
const TYPE_LABEL = { checking: 'Everyday', savings: 'Savings', mortgage: 'Mortgage', credit: 'Credit', investment: 'Investment' }
const TYPE_COLOR = { checking: '#0099ff', savings: '#00c896', mortgage: '#ff4d6d', credit: '#f4a261', investment: '#9b5de5' }

const clickable = {
  cursor: 'pointer',
  transition: 'opacity 0.15s',
}

function AccountCard({ acc, onClick }) {
  const { income, expenses, txCount } = acc.stats30d
  const isDebt = ['mortgage', 'credit'].includes(acc._type)
  const bal = acc.balance?.current || 0

  return (
    <div
      className="card"
      style={{ borderTop: `2px solid ${TYPE_COLOR[acc._type] || '#444'}`, ...clickable }}
      onClick={onClick}
      title="View transactions for this account"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <span className={`account-badge badge-${acc._type}`} style={{ marginBottom: 6, display: 'inline-block' }}>
            {TYPE_LABEL[acc._type] || acc._type}
          </span>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{acc.name}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{acc.connection?.name} · {acc.formatted_account}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: isDebt ? 'var(--danger)' : 'var(--accent)', fontWeight: 600 }}>
            {fmt(Math.abs(bal))}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>{isDebt ? 'outstanding' : 'balance'}</div>
        </div>
      </div>
      {txCount > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', gap: 16 }}>
          {income > 0 && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>IN · 30d</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent)' }}>+{fmt(income)}</div>
            </div>
          )}
          {expenses > 0 && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>OUT · 30d</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--danger)' }}>-{fmt(expenses)}</div>
            </div>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>TXN</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{txCount}</div>
          </div>
        </div>
      )}
      {acc.balance?.available !== undefined && acc.balance.available !== bal && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>Available: {fmt(acc.balance.available)}</div>
      )}
      <div style={{ marginTop: 8, fontSize: 10, color: 'var(--border2)' }}>Click to view transactions →</div>
    </div>
  )
}

function PropertyCard({ prop }) {
  return (
    <div className="card" style={{ borderTop: '2px solid #e9c46a' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, paddingRight: 12 }}>
          <span style={{ fontSize: 10, background: 'rgba(233,196,106,0.15)', color: 'var(--gold)', borderRadius: 4, padding: '2px 7px', marginBottom: 8, display: 'inline-block', fontWeight: 600 }}>
            PROPERTY
          </span>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>{prop.address}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>{prop.source} · {prop.sourceDate}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--gold)', fontWeight: 600 }}>{fmt(prop.value)}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>est. market value</div>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const api = useApi()
  const navigate = useNavigate()
  const { data, loading, error } = useFetch(api.summary)

  const [catRange, setCatRange] = useState('30d')
  const { start: catStart, end: catEnd } = rangeToParams(catRange)
  const { data: spendingData, loading: spendingLoading } = useFetch(
    () => api.spending(catStart, catEnd),
    [catRange]
  )

  if (loading) return <div className="loading"><span className="dot-pulse">Loading your financial picture</span></div>
  if (error)   return <div className="error-box">⚠ {error}</div>

  const s = data
  const savingsColor = s.savingsRate >= 20 ? 'stat-up' : s.savingsRate >= 0 ? '' : 'stat-down'
  const assetAccounts = s.accounts.filter(a => !['mortgage', 'credit'].includes(a._type))
  const debtAccounts  = s.accounts.filter(a => ['mortgage', 'credit'].includes(a._type))
  const properties    = s.properties || []

  function go(params) {
    navigate(`/transactions?${new URLSearchParams(params).toString()}`)
  }

  return (
    <div className="page-fade">
      <div className="flex-between mb-24">
        <div>
          <div className="section-title">Financial Overview</div>
          <div className="section-sub">All connected NZ accounts · updated now</div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
          {s.transactionCount} transactions · last 30 days
        </div>
      </div>

      {/* Net worth hero */}
      <div className="card card-lg mb-24" style={{ background: 'linear-gradient(135deg, #111418 60%, #0d1a14)' }}>
        <div className="stat-label">Total Net Worth</div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 48, letterSpacing: -2, color: s.netWorth >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
          {fmt(s.netWorth)}
        </div>
        <div className="nw-bar" style={{ maxWidth: 500, marginTop: 12 }}>
          <div className="nw-bar-fill" style={{ width: `${Math.min(100, (s.totalAssets / (s.totalAssets + s.totalLiabilities)) * 100)}%` }} />
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--accent)' }}>↑ Total Assets {fmt(s.totalAssets)}</span>
          <span style={{ fontSize: 12, color: 'var(--gold)' }}>⌂ Property {fmt(s.totalPropertyValue)}</span>
          <span style={{ fontSize: 12, color: 'var(--accent2)' }}>⬡ Bank {fmt(s.totalBankAssets)}</span>
          <span style={{ fontSize: 12, color: 'var(--danger)' }}>↓ Liabilities {fmt(s.totalLiabilities)}</span>
        </div>
      </div>

      {/* 30-day cash flow — clickable */}
      <div className="grid-3 mb-24">
        <div
          className="stat-tile"
          style={clickable}
          onClick={() => go({ range: '30d', type: 'credit' })}
          title="View all income transactions"
        >
          <div className="stat-label">Income · 30d</div>
          <div className="stat-value stat-up">{fmt(s.income30d)}</div>
          <div className="stat-sub">all credited transactions →</div>
        </div>
        <div
          className="stat-tile"
          style={clickable}
          onClick={() => go({ range: '30d', type: 'debit' })}
          title="View all expense transactions"
        >
          <div className="stat-label">Expenses · 30d</div>
          <div className="stat-value stat-down">{fmt(s.expenses30d)}</div>
          <div className="stat-sub">all debited transactions →</div>
        </div>
        <div
          className="stat-tile"
          style={clickable}
          onClick={() => go({ range: '30d' })}
          title="View all transactions"
        >
          <div className="stat-label">Savings Rate</div>
          <div className={`stat-value ${savingsColor}`}>{s.savingsRate.toFixed(1)}%</div>
          <div className="stat-sub">{s.savingsRate >= 20 ? '✓ On track' : s.savingsRate >= 0 ? 'Room to improve' : 'Spending > income'} →</div>
        </div>
      </div>

      {/* Spending by category — with range filter */}
      <div className="card mb-24">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div className="section-title" style={{ fontSize: 15, marginBottom: 0 }}>
            Spending by Category
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {RANGE_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                className={`btn ${catRange === key ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '4px 10px', fontSize: 11 }}
                onClick={() => setCatRange(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {spendingLoading && <div style={{ color: 'var(--muted)', fontSize: 12, padding: '20px 0' }}><span className="dot-pulse">Loading</span></div>}

        {!spendingLoading && spendingData?.length > 0 && (() => {
          const top8 = spendingData.slice(0, 8)
          const total = spendingData.reduce((s, c) => s + c.amount, 0)
          return (
            <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
              <PieChart width={200} height={180}>
                  <Pie
                    data={top8}
                    dataKey="amount"
                    nameKey="category"
                    cx="50%" cy="50%"
                    outerRadius={80} innerRadius={44}
                    style={{ cursor: 'pointer' }}
                    onClick={(d) => go({ range: catRange, type: 'debit', category: d.category })}
                  >
                    {top8.map((cat, i) => {
                      const grp = getCategoryGroup(cat.category)
                      return <Cell key={i} fill={grp ? grp.color : COLORS[i % COLORS.length]} />
                    })}
                  </Pie>
                  <Tooltip content={<PieTooltip total={total} />} />
                </PieChart>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 200 }}>
                {top8.map((cat, i) => {
                  const pct = total > 0 ? (cat.amount / total * 100).toFixed(1) : 0
                  const grp = getCategoryGroup(cat.category)
                  const dotColor = grp ? grp.color : COLORS[i % COLORS.length]
                  return (
                    <div
                      key={cat.category}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...clickable, padding: '4px 6px', borderRadius: 6 }}
                      onClick={() => go({ range: catRange, type: 'debit', category: cat.category })}
                      title={`View ${cat.category} transactions`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: grp ? grp.color : 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.category}</span>
                        <span style={{ fontSize: 10, color: 'var(--border2)', flexShrink: 0 }}>{pct}%</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmt(cat.amount)}</span>
                        <span style={{ fontSize: 10, color: 'var(--border2)' }}>→</span>
                      </div>
                    </div>
                  )
                })}
                {spendingData.length > 8 && (
                  <div
                    style={{ fontSize: 11, color: 'var(--muted)', padding: '4px 6px', ...clickable }}
                    onClick={() => go({ range: catRange, type: 'debit' })}
                  >
                    + {spendingData.length - 8} more categories →
                  </div>
                )}
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>Total spending</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--danger)' }}>{fmt(total)}</span>
                </div>
              </div>
            </div>
          )
        })()}

        {!spendingLoading && (!spendingData || spendingData.length === 0) && (
          <div style={{ color: 'var(--muted)', fontSize: 13, padding: '20px 0' }}>No spending data for this period.</div>
        )}
      </div>

      {/* Property portfolio */}
      {properties.length > 0 && (
        <div className="mb-24">
          <div className="flex-between mb-16">
            <div className="section-title" style={{ fontSize: 15 }}>
              Property Portfolio
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--gold)', marginLeft: 12 }}>{fmt(s.totalPropertyValue)}</span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{properties.length} properties · refreshes monthly</span>
          </div>
          <div className="grid-2">
            {properties.map((prop, i) => <PropertyCard key={i} prop={prop} />)}
          </div>
        </div>
      )}

      {/* Bank accounts — clickable */}
      {assetAccounts.length > 0 && (
        <div className="mb-24">
          <div className="section-title mb-16" style={{ fontSize: 15 }}>
            Bank Accounts
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent2)', marginLeft: 12 }}>{fmt(s.totalBankAssets)}</span>
          </div>
          <div className="grid-2">
            {assetAccounts.map(acc => (
              <AccountCard
                key={acc._id}
                acc={acc}
                onClick={() => go({ range: '30d', account: acc._id })}
              />
            ))}
          </div>
        </div>
      )}

      {/* Liabilities — clickable */}
      {debtAccounts.length > 0 && (
        <div>
          <div className="section-title mb-16" style={{ fontSize: 15 }}>
            Liabilities
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--danger)', marginLeft: 12 }}>{fmt(s.totalLiabilities)}</span>
          </div>
          <div className="grid-2">
            {debtAccounts.map(acc => (
              <AccountCard
                key={acc._id}
                acc={acc}
                onClick={() => go({ range: '30d', account: acc._id })}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
