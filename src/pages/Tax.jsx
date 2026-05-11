import { useState, useMemo } from 'react'
import { useFetch } from '../hooks/useFetch'
import { useApi, fmt, fmtDate } from '../lib/api'
import { getCategoryGroup } from '../lib/categories'
import { calcGst, getGstRule } from '../lib/gstRules'
import QuarterCalendar from '../components/QuarterCalendar'

const GST_FRAC    = 15 / 115
const EX_GST_FRAC = 100 / 115

const FREQ = [
  { key: '1m',  label: 'Monthly',   m: 1 },
  { key: '2m',  label: '2-Monthly', m: 2 },
  { key: '6m',  label: '6-Monthly', m: 6 },
]

// NZ tax year starts 1 April (month index 3).
// 2-monthly periods: Apr-May | Jun-Jul | Aug-Sep | Oct-Nov | Dec-Jan | Feb-Mar
// 6-monthly periods: Apr-Sep | Oct-Mar
// Monthly: standard calendar months (no realignment needed)
const TAX_START = 3  // April

// Use local date parts — avoids UTC shift turning Apr 1 → Mar 31 in NZ (UTC+12/+13)
function localDateStr(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function computePeriod(freqM, offset) {
  const now      = new Date()
  const calMonth = now.getMonth()
  const calYear  = now.getFullYear()

  if (freqM === 1) {
    // Monthly: plain calendar months
    const start = new Date(calYear, calMonth + offset, 1)
    const end   = new Date(start.getFullYear(), start.getMonth() + 1, 0)
    return { start: localDateStr(start), end: localDateStr(end) }
  }

  // For 2m and 6m: align to NZ tax year (April = 0)
  const periodsPerYear = 12 / freqM

  // Tax-year-relative month (April=0 … March=11)
  const taxMonth = (calMonth - TAX_START + 12) % 12
  // Calendar year in which this tax year's April falls
  const taxYear  = calMonth >= TAX_START ? calYear : calYear - 1

  // Current period index within the tax year (0-based)
  const periodIdx = Math.floor(taxMonth / freqM)

  // Apply offset to get an absolute period number, then decompose
  const absPeriod    = taxYear * periodsPerYear + periodIdx + offset
  const tgtTaxYear   = Math.floor(absPeriod / periodsPerYear)
  const tgtPeriodIdx = ((absPeriod % periodsPerYear) + periodsPerYear) % periodsPerYear

  // Convert back to calendar start month
  const startTaxMonth = tgtPeriodIdx * freqM
  const startCalMonth = (startTaxMonth + TAX_START) % 12
  // April–December sits in tgtTaxYear; January–March sits in tgtTaxYear+1
  const startCalYear  = startCalMonth >= TAX_START ? tgtTaxYear : tgtTaxYear + 1

  const start = new Date(startCalYear, startCalMonth, 1)
  const end   = new Date(startCalYear, startCalMonth + freqM, 0)
  return { start: localDateStr(start), end: localDateStr(end) }
}

// NZ tax year label: April 2026 → March 2027 = "FY 2026–27"
function taxYearLabel(start, end) {
  const s = new Date(start), e = new Date(end)
  // Tax year is named after the April-start calendar year
  const aprilYear = s.getMonth() >= TAX_START ? s.getFullYear() : s.getFullYear() - 1
  return `FY ${aprilYear}–${String(aprilYear + 1).slice(-2)}`
}

function fmtPeriodLabel(start, end) {
  const s = new Date(start), e = new Date(end)
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear())
    return s.toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' })
  // Cross-year period (e.g. Dec–Jan or Oct–Mar)
  if (s.getFullYear() !== e.getFullYear())
    return `${s.toLocaleDateString('en-NZ', { month: 'short', year: 'numeric' })} – ${e.toLocaleDateString('en-NZ', { month: 'short', year: 'numeric' })}`
  return `${s.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

function fmtDueDate(periodEnd) {
  const e = new Date(periodEnd)
  // NZ GST: due 28th of the month after period end.
  // Special case: period ending 31 March → due 7 May (IRD concession).
  if (e.getMonth() === 2 && e.getDate() === 31) {
    return new Date(e.getFullYear(), 4, 7)
      .toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
  }
  const due = new Date(e.getFullYear(), e.getMonth() + 1, 28)
  return due.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
}

const gstOf   = v => Math.abs(v) * GST_FRAC
const exGstOf = v => Math.abs(v) * EX_GST_FRAC

// ── small reusable components ──────────────────────────────────────────────

function GstBox({ label, box, value, note, highlight, muted }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '9px 16px',
      background: highlight ? 'rgba(52,211,153,0.06)' : 'transparent',
      borderRadius: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        {box && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--border2)', letterSpacing: 0.5, textTransform: 'uppercase', minWidth: 38 }}>{box}</span>}
        <span style={{ fontSize: 13, color: muted ? 'var(--muted)' : 'var(--text)', fontWeight: highlight ? 600 : 400 }}>{label}</span>
        {note && <span style={{ fontSize: 11, color: 'var(--border2)' }}>{note}</span>}
      </div>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 14,
        color: highlight ? 'var(--accent)' : muted ? 'var(--muted)' : 'var(--text)',
        fontWeight: highlight ? 700 : 400,
      }}>{fmt(value)}</span>
    </div>
  )
}

function EditableBox({ label, box, value, onChange, note }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        {box && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--border2)', letterSpacing: 0.5, textTransform: 'uppercase', minWidth: 38 }}>{box}</span>}
        <span style={{ fontSize: 13, color: 'var(--text)' }}>{label}</span>
        {note && <span style={{ fontSize: 11, color: 'var(--border2)' }}>{note}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>$</span>
        <input
          type="number" min="0" step="0.01" value={value}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          style={{
            width: 100, textAlign: 'right', background: 'var(--surface2)',
            border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px',
            color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 13,
          }}
        />
      </div>
    </div>
  )
}

// Treatment badge
function TreatBadge({ type }) {
  const styles = {
    'Standard-rated supply':  { color: '#34d399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.25)',  label: '↑ Standard supply' },
    'Input tax credit':       { color: '#fb923c', bg: 'rgba(251,146,60,0.1)',  border: 'rgba(251,146,60,0.25)',  label: '↓ Input tax credit' },
    'Exempt / review':        { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.25)', label: '— Exempt / review' },
  }
  const s = styles[type] || styles['Exempt / review']
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10, whiteSpace: 'nowrap',
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
    }}>{s.label}</span>
  )
}

// Individual transaction row (inside expanded category)
function TxRow({ tx, accounts, isIncome, cat }) {
  const acct            = accounts.find(a => a._id === tx._account)
  const incl            = Math.abs(tx.amount)
  const exGst           = exGstOf(incl)
  const { gstTotal, gstClaimable, claimPct } = isIncome
    ? { gstTotal: gstOf(incl), gstClaimable: gstOf(incl), claimPct: 100 }
    : calcGst(incl, cat)
  const claimColor = claimPct === 0 ? 'var(--muted)' : claimPct < 100 ? 'var(--warn)' : 'var(--accent)'

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '80px 1fr 130px 90px 90px 100px 90px',
      alignItems: 'center',
      padding: '8px 16px 8px 36px',
      borderBottom: '1px solid rgba(55,65,81,0.5)',
      fontSize: 12,
      background: 'rgba(0,0,0,0.15)',
      gap: 4,
    }}>
      <div style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{fmtDate(tx.date)}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {tx.merchant?.name || tx.description}
        </div>
        {tx.merchant?.name && (
          <div style={{ color: 'var(--muted)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</div>
        )}
      </div>
      <div style={{ color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {acct ? `${acct.connection?.name} · ${acct.name}` : '—'}
      </div>
      <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: isIncome ? 'var(--accent)' : 'var(--danger)' }}>{fmt(incl)}</div>
      <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>{fmt(exGst)}</div>
      <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>{fmt(gstTotal)}</div>
      <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: claimColor, fontWeight: 600 }}>{fmt(gstClaimable)}</div>
    </div>
  )
}

// Category row with expand/collapse to show individual transactions
function CategoryGroup({ cat, total, txs, accounts, isIncome }) {
  const [open, setOpen] = useState(false)
  const grp      = getCategoryGroup(cat)
  const color    = grp?.color ?? (isIncome ? 'var(--accent)' : 'var(--muted)')
  const gstRule  = isIncome ? null : getGstRule(cat)
  const claimPct = isIncome ? 100 : gstRule.claimPct
  const gstTotal     = gstOf(total)
  const gstClaimable = gstTotal * (claimPct / 100)
  const exGst        = exGstOf(total)

  const claimColor = claimPct === 0 ? 'var(--muted)'
    : claimPct < 100 ? 'var(--warn)' : 'var(--accent)'

  return (
    <>
      {/* Category summary row */}
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 60px 110px 100px 110px 110px 32px',
          alignItems: 'center',
          padding: '10px 16px',
          borderBottom: open ? 'none' : '1px solid var(--border)',
          fontSize: 13,
          cursor: 'pointer',
          background: open ? 'rgba(255,255,255,0.03)' : 'transparent',
          transition: 'background 0.15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
          <span style={{ color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat}</span>
          {grp && (
            <span style={{ fontSize: 10, color: grp.color, background: grp.bg, border: `1px solid ${grp.border}`, borderRadius: 10, padding: '1px 7px', flexShrink: 0 }}>
              {grp.label}
            </span>
          )}
          {!isIncome && gstRule && (
            <span title={`${gstRule.rule} — ${gstRule.notes}`} style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, flexShrink: 0, cursor: 'help',
              color: claimColor,
              background: claimPct === 0 ? 'rgba(148,163,184,0.1)' : claimPct < 100 ? 'rgba(251,146,60,0.1)' : 'rgba(52,211,153,0.1)',
              border: `1px solid ${claimPct === 0 ? 'rgba(148,163,184,0.25)' : claimPct < 100 ? 'rgba(251,146,60,0.25)' : 'rgba(52,211,153,0.25)'}`,
            }}>{claimPct}% claimable</span>
          )}
        </div>
        <div style={{ textAlign: 'right', color: 'var(--muted)', fontSize: 12 }}>{txs.length}</div>
        <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: isIncome ? 'var(--accent)' : 'var(--text)' }}>{fmt(total)}</div>
        <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>{fmt(exGst)}</div>
        <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--muted)', fontSize: 12 }}>{fmt(gstTotal)}</div>
        <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: claimColor, fontWeight: 700 }}>{fmt(gstClaimable)}</div>
        <div style={{ textAlign: 'right', color: 'var(--border2)', fontSize: 11 }}>{open ? '▲' : '▼'}</div>
      </div>

      {/* Expanded transactions */}
      {open && (
        <div style={{ borderBottom: '1px solid var(--border)' }}>
          {/* Rule explanation banner */}
          {!isIncome && gstRule && (
            <div style={{
              display: 'flex', gap: 8, alignItems: 'flex-start',
              padding: '8px 16px 8px 36px',
              background: 'rgba(96,165,250,0.06)',
              borderBottom: '1px solid var(--border)',
              fontSize: 11, color: 'var(--muted)', lineHeight: 1.5,
            }}>
              <span style={{ color: 'var(--accent2)', flexShrink: 0 }}>ⓘ</span>
              <span><strong style={{ color: 'var(--accent2)' }}>{gstRule.rule}</strong> — {gstRule.notes}</span>
            </div>
          )}
          {/* Sub-header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '80px 1fr 130px 90px 90px 100px 90px',
            padding: '6px 16px 6px 36px',
            background: 'rgba(0,0,0,0.2)',
            fontSize: 10, fontWeight: 700, color: 'var(--border2)',
            textTransform: 'uppercase', letterSpacing: 0.5, gap: 4,
          }}>
            <div>Date</div>
            <div>Description</div>
            <div>Account</div>
            <div style={{ textAlign: 'right' }}>Incl. GST</div>
            <div style={{ textAlign: 'right' }}>Ex-GST</div>
            <div style={{ textAlign: 'right' }}>GST Total</div>
            <div style={{ textAlign: 'right' }}>Claimable</div>
          </div>
          {txs.map(tx => (
            <TxRow key={tx._id} tx={tx} accounts={accounts} isIncome={isIncome} cat={cat} />
          ))}
          {/* Category subtotal */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '80px 1fr 130px 90px 90px 100px 90px',
            padding: '8px 16px 8px 36px',
            background: 'rgba(0,0,0,0.25)',
            fontSize: 12, fontWeight: 700, gap: 4,
            borderTop: '1px solid var(--border)',
          }}>
            <div style={{ gridColumn: '1/4', color: 'var(--muted)' }}>
              Subtotal — {cat}
              {!isIncome && claimPct < 100 && <span style={{ marginLeft: 8, color: 'var(--warn)', fontSize: 11 }}>({claimPct}% rate applied)</span>}
            </div>
            <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: isIncome ? 'var(--accent)' : 'var(--danger)' }}>{fmt(total)}</div>
            <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>{fmt(exGst)}</div>
            <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>{fmt(gstTotal)}</div>
            <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: claimColor }}>{fmt(gstClaimable)}</div>
          </div>
        </div>
      )}
    </>
  )
}

function TableHeader({ isIncome }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 60px 110px 100px 110px 110px 32px',
      padding: '8px 16px',
      background: 'var(--surface2)',
      borderBottom: '1px solid var(--border)',
      fontSize: 11, fontWeight: 600, color: 'var(--muted)',
      textTransform: 'uppercase', letterSpacing: 0.5,
    }}>
      <div>Category</div>
      <div style={{ textAlign: 'right' }}>Txns</div>
      <div style={{ textAlign: 'right' }}>Total (incl.)</div>
      <div style={{ textAlign: 'right' }}>Ex-GST</div>
      <div style={{ textAlign: 'right' }}>GST Total</div>
      <div style={{ textAlign: 'right' }}>{isIncome ? 'GST Collected' : 'Claimable GST'}</div>
      <div />
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function Tax() {
  const api = useApi()

  const [freqKey,       setFreqKey]       = useState('2m')
  const [offset,        setOffset]        = useState(0)
  const [accountFilter, setAccountFilter] = useState('all')
  const [zeroRated,     setZeroRated]     = useState(0)
  const [nonCreditable, setNonCreditable] = useState(0)
  const [expandSales,   setExpandSales]   = useState(true)
  const [expandPurch,   setExpandPurch]   = useState(true)

  const freqM  = FREQ.find(f => f.key === freqKey).m
  const period = useMemo(() => computePeriod(freqM, offset), [freqM, offset])

  const { data, loading, error } = useFetch(
    () => api.transactions(period.start, period.end),
    [period.start, period.end]
  )
  const { data: accountsData } = useFetch(api.accounts)
  const accounts = accountsData?.items || []

  const allTxs = (data?.items || []).filter(tx => !tx._internal)
  const txs    = accountFilter === 'all' ? allTxs : allTxs.filter(tx => tx._account === accountFilter)

  const salesTxs    = txs.filter(t => t.amount > 0)
  const purchaseTxs = txs.filter(t => t.amount < 0)

  const totalSalesIncl     = salesTxs.reduce((s, t) => s + t.amount, 0)
  const totalPurchasesIncl = purchaseTxs.reduce((s, t) => s + Math.abs(t.amount), 0)
  const taxableSales       = Math.max(0, totalSalesIncl - zeroRated)
  const gstOnSales         = gstOf(taxableSales)

  // GST credits use per-category claim rates from gstRules.js
  const gstCredits = useMemo(() => purchaseTxs.reduce((sum, tx) => {
    const cat  = tx.manual_category || tx.category?.groups?.personal_finance?.name || tx.category?.name || tx.ai_category || 'Uncategorised'
    const incl = Math.abs(tx.amount)
    return sum + calcGst(incl, cat).gstClaimable
  }, 0), [purchaseTxs])

  // Box 11 still shows total GST on all purchases (before category-rate adjustments)
  const totalGstOnPurchases = gstOf(totalPurchasesIncl)

  const netGst   = gstOnSales - gstCredits
  const isRefund = netGst < 0

  const salesByCategory = useMemo(() => {
    const map = {}
    for (const tx of salesTxs) {
      const cat = tx.manual_category || tx.category?.groups?.personal_finance?.name || tx.category?.name || tx.ai_category || 'Income'
      if (!map[cat]) map[cat] = { cat, total: 0, txs: [] }
      map[cat].total += tx.amount
      map[cat].txs.push(tx)
    }
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [salesTxs])

  const purchByCategory = useMemo(() => {
    const map = {}
    for (const tx of purchaseTxs) {
      const cat = tx.manual_category || tx.category?.groups?.personal_finance?.name || tx.category?.name || tx.ai_category || 'Uncategorised'
      if (!map[cat]) map[cat] = { cat, total: 0, txs: [] }
      map[cat].total += Math.abs(tx.amount)
      map[cat].txs.push(tx)
    }
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [purchaseTxs])

  const periodLabel = fmtPeriodLabel(period.start, period.end)
  const fyLabel     = taxYearLabel(period.start, period.end)
  const dueDate     = fmtDueDate(period.end)

  return (
    <div className="page-fade">

      {/* ── Header ── */}
      <div className="flex-between mb-24">
        <div>
          <div className="section-title">GST Return</div>
          <div className="section-sub">NZ IRD · GST101A · 15% standard rate · click any category to see transactions</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {FREQ.map(f => (
              <button key={f.key}
                className={`btn ${freqKey === f.key ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: 12, padding: '6px 12px' }}
                onClick={() => { setFreqKey(f.key); setOffset(0) }}
              >{f.label}</button>
            ))}
          </div>
          <select
            value={accountFilter}
            onChange={e => setAccountFilter(e.target.value)}
            style={{
              background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6,
              color: 'var(--text)', padding: '7px 12px', fontSize: 12, cursor: 'pointer',
            }}
          >
            <option value="all">All accounts</option>
            {accounts.map(a => (
              <option key={a._id} value={a._id}>{a.connection?.name} · {a.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Period navigator with visual calendar ── */}
      <div className="card mb-16" style={{
        padding: '28px 32px',
        background: 'linear-gradient(135deg, rgba(96,165,250,0.08) 0%, rgba(52,211,153,0.05) 100%)',
        border: '1px solid rgba(96,165,250,0.15)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      }}>
        {/* Header section */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 24,
            fontWeight: 700,
            color: 'var(--accent)',
            letterSpacing: -0.5,
            marginBottom: 8,
          }}>
            {periodLabel}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 11px',
              borderRadius: 12,
              color: 'var(--accent2)',
              background: 'rgba(96,165,250,0.15)',
              border: '1px solid rgba(96,165,250,0.3)',
              letterSpacing: 0.5,
            }}>{fyLabel}</span>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
              {period.start} → {period.end}
            </span>
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 6,
              color: offset < 0 ? 'var(--warn)' : offset === 0 ? 'var(--accent)' : 'var(--warn)',
              background: offset < 0 ? 'rgba(251,146,60,0.12)' : offset === 0 ? 'rgba(52,211,153,0.12)' : 'rgba(251,146,60,0.12)',
              letterSpacing: 0.3,
            }}>
              {offset < 0 ? '📅 Past period' : offset === 0 ? '📅 Current period' : '📅 Future period'}
            </span>
          </div>
        </div>

        {/* Calendar component */}
        <QuarterCalendar freqM={freqM} offset={offset} onOffsetChange={setOffset} />
      </div>

      {loading && <div className="loading" style={{ padding: 32 }}><span className="dot-pulse">Loading transactions</span></div>}
      {error   && <div className="error-box" style={{ marginBottom: 16 }}>⚠ {error}</div>}

      {!loading && !error && (<>

        {/* ── GST Return Boxes ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

          {/* Sales */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: 'rgba(52,211,153,0.07)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, color: 'var(--accent)' }}>↑</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent)', letterSpacing: 0.3, textTransform: 'uppercase' }}>Sales & Income</span>
              </div>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{salesTxs.length} transactions</span>
            </div>
            <div style={{ padding: '6px 0' }}>
              <GstBox box="Box 5"  label="Total sales (incl. GST)"     value={totalSalesIncl}   highlight />
              <EditableBox box="Box 6" label="Zero-rated supplies" note="exports, certain services" value={zeroRated} onChange={setZeroRated} />
              <div style={{ margin: '4px 16px', borderTop: '1px solid var(--border)' }} />
              <GstBox label="Taxable supplies (5 − 6)" value={taxableSales} muted={taxableSales === 0} />
              <GstBox label="GST collected on sales"   note="× 3/23"  value={gstOnSales}  highlight />
            </div>
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)' }}>
              <span>Ex-GST revenue</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{fmt(exGstOf(taxableSales))}</span>
            </div>
          </div>

          {/* Purchases */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: 'rgba(248,113,113,0.07)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, color: 'var(--danger)' }}>↓</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--danger)', letterSpacing: 0.3, textTransform: 'uppercase' }}>Purchases & Expenses</span>
              </div>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{purchaseTxs.length} transactions</span>
            </div>
            <div style={{ padding: '6px 0' }}>
              <GstBox box="Box 11" label="Total purchases (incl. GST)" value={totalPurchasesIncl} highlight />
              <GstBox label="Total GST on purchases" note="× 3/23" value={totalGstOnPurchases} muted />
              <div style={{ margin: '4px 16px', borderTop: '1px solid var(--border)' }} />
              <GstBox label="Claimable GST credits" note="after category rates" value={gstCredits} highlight />
              <div style={{ padding: '6px 16px 2px', fontSize: 11, color: 'var(--muted)' }}>
                Category rates applied: Food&Drink&nbsp;50% · Entertainment&nbsp;50% · Transport&nbsp;75% · Internet&nbsp;75% · Exempt categories&nbsp;0%
              </div>
            </div>
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)' }}>
              <span>Ex-GST expenses (total)</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{fmt(exGstOf(totalPurchasesIncl))}</span>
            </div>
          </div>
        </div>

        {/* ── Net GST ── */}
        <div className="card mb-16" style={{
          padding: '20px 24px',
          background: isRefund ? 'rgba(52,211,153,0.08)' : 'rgba(251,146,60,0.08)',
          border: `1px solid ${isRefund ? 'rgba(52,211,153,0.25)' : 'rgba(251,146,60,0.25)'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: 4 }}>
                {isRefund ? 'GST Refund Due to You' : 'GST Payable to IRD'}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 34, fontWeight: 700, color: isRefund ? 'var(--accent)' : 'var(--warn)' }}>
                  {fmt(Math.abs(netGst))}
                </span>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>NZD</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                GST collected {fmt(gstOnSales)} − input tax credits {fmt(gstCredits)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Filing Due</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: isRefund ? 'var(--accent)' : 'var(--warn)' }}>{dueDate}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>File via myIR · GST101A</div>
            </div>
          </div>
          {totalSalesIncl + totalPurchasesIncl > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
                <span>GST collected on sales ({fmt(gstOnSales)})</span>
                <span>Input tax credits ({fmt(gstCredits)})</span>
              </div>
              <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', height: 8 }}>
                <div style={{ flex: gstOnSales || 1, background: 'var(--accent)', opacity: 0.6 }} />
                <div style={{ flex: gstCredits || 0, background: 'var(--danger)', opacity: 0.6 }} />
              </div>
            </div>
          )}
        </div>

        {/* ── Sales breakdown ── */}
        <div className="card mb-16" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            onClick={() => setExpandSales(v => !v)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14, color: 'var(--accent)' }}>↑</span>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Sales & Income — Transaction Detail</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{salesByCategory.length} categories · {salesTxs.length} transactions</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <TreatBadge type="Standard-rated supply" />
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>{expandSales ? '▲' : '▼'}</span>
            </div>
          </div>

          {expandSales && (<>
            <TableHeader isIncome />
            {salesByCategory.length === 0
              ? <div style={{ padding: '20px 16px', color: 'var(--muted)', fontSize: 13 }}>No income transactions in this period.</div>
              : salesByCategory.map(r => (
                  <CategoryGroup key={r.cat} cat={r.cat} total={r.total} txs={r.txs} accounts={accounts} isIncome />
                ))
            }
            {salesByCategory.length > 0 && (
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 60px 120px 110px 110px 32px',
                padding: '10px 16px', background: 'var(--surface2)',
                borderTop: '2px solid var(--border)', fontSize: 12, fontWeight: 700,
              }}>
                <div style={{ color: 'var(--muted)' }}>Total sales</div>
                <div style={{ textAlign: 'right', color: 'var(--muted)' }}>{salesTxs.length}</div>
                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{fmt(totalSalesIncl)}</div>
                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmt(exGstOf(totalSalesIncl))}</div>
                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{fmt(gstOf(totalSalesIncl))}</div>
                <div />
              </div>
            )}
          </>)}
        </div>

        {/* ── Purchases breakdown ── */}
        <div className="card mb-16" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            onClick={() => setExpandPurch(v => !v)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14, color: 'var(--danger)' }}>↓</span>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Purchases & Expenses — Transaction Detail</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{purchByCategory.length} categories · {purchaseTxs.length} transactions</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <TreatBadge type="Input tax credit" />
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>{expandPurch ? '▲' : '▼'}</span>
            </div>
          </div>

          {expandPurch && (<>
            <TableHeader isIncome={false} />
            {purchByCategory.length === 0
              ? <div style={{ padding: '20px 16px', color: 'var(--muted)', fontSize: 13 }}>No expense transactions in this period.</div>
              : purchByCategory.map(r => (
                  <CategoryGroup key={r.cat} cat={r.cat} total={r.total} txs={r.txs} accounts={accounts} isIncome={false} />
                ))
            }
            {purchByCategory.length > 0 && (
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 60px 120px 110px 110px 32px',
                padding: '10px 16px', background: 'var(--surface2)',
                borderTop: '2px solid var(--border)', fontSize: 12, fontWeight: 700,
              }}>
                <div style={{ color: 'var(--muted)' }}>Total purchases</div>
                <div style={{ textAlign: 'right', color: 'var(--muted)' }}>{purchaseTxs.length}</div>
                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--danger)' }}>{fmt(totalPurchasesIncl)}</div>
                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmt(exGstOf(totalPurchasesIncl))}</div>
                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--danger)' }}>{fmt(gstOf(totalPurchasesIncl))}</div>
                <div />
              </div>
            )}
          </>)}
        </div>

        {/* ── Advisory notes ── */}
        <div className="card" style={{ padding: '16px 20px', background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent2)', marginBottom: 10 }}>Before filing — check these items</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              ['Wages & salaries', 'No GST — add to Box 12 (non-creditable) if included in purchases'],
              ['Bank interest received', 'Exempt supply — may need to reduce Box 5 or add to Box 6'],
              ['Residential rent paid', 'Exempt — no GST claimable; add to Box 12'],
              ['Zero-rated exports', 'GST 0% — include in Box 5 and enter same amount in Box 6'],
              ['Private use portion', 'Only claim the business-use % of mixed purchases in Box 11'],
              ['Late filing penalty', `File by ${dueDate} to avoid IRD late filing fee`],
            ].map(([title, desc]) => (
              <div key={title} style={{ display: 'flex', gap: 8, padding: '6px 8px', borderRadius: 6, background: 'rgba(96,165,250,0.05)' }}>
                <span style={{ color: 'var(--accent2)', flexShrink: 0, marginTop: 2 }}>ⓘ</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--border2)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            All amounts assume NZ GST-inclusive pricing at 15%. Calculations are indicative only — verify with your accountant before filing. GST registration threshold is NZD $60,000 turnover per 12 months.
          </div>
        </div>

      </>)}
    </div>
  )
}
