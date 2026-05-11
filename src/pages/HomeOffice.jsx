import { useState, useMemo } from 'react'
import { useApi, fmt, fmtDate } from '../lib/api'
import { useFetch } from '../hooks/useFetch'

// Local date string — never use toISOString() for calendar dates (NZ tz quirk)
function localDateStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function pct(v) { return `${(v * 100).toFixed(2)}%` }

const TABS = ['Overview', 'Expenses', 'Setup', 'Rules & Tagging', 'GST & Tax', 'Export']

export default function HomeOffice() {
  const api = useApi()
  const [tab, setTab] = useState('Overview')

  // Default to current NZ tax year (1 Apr → 31 Mar)
  const today = new Date()
  const taxYearStart = today.getMonth() >= 3
    ? `${today.getFullYear()}-04-01`
    : `${today.getFullYear() - 1}-04-01`
  const taxYearEnd = today.getMonth() >= 3
    ? `${today.getFullYear() + 1}-03-31`
    : `${today.getFullYear()}-03-31`

  const [start, setStart] = useState(taxYearStart)
  const [end, setEnd]     = useState(taxYearEnd)

  const config = useFetch(() => api.hoConfig(), [])
  const dashboard = useFetch(() => api.hoDashboard({ start, end }), [start, end])
  const expenses = useFetch(() => api.hoExpenses({ start, end }), [start, end])

  function refreshAll() {
    config.refresh()
    dashboard.refresh()
    expenses.refresh()
  }

  return (
    <div className="page-fade ho-page">
      <div className="flex-between mb-24">
        <div>
          <h1 className="section-title" style={{ fontSize: 28, marginBottom: 0 }}>Home Office</h1>
          <div className="section-sub">Expense allocation across companies</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={start} onChange={e => setStart(e.target.value)} style={inp} />
          <span className="text-muted">→</span>
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={inp} />
        </div>
      </div>

      <div className="tabs">
        {TABS.map(t => (
          <div key={t} onClick={() => setTab(t)} className={`tab${tab === t ? ' active' : ''}`}>{t}</div>
        ))}
      </div>

      {tab === 'Overview'        && <Overview config={config} dashboard={dashboard} api={api} onChange={refreshAll} />}
      {tab === 'Expenses'        && <Expenses expenses={expenses} config={config} api={api} onChange={refreshAll} />}
      {tab === 'Setup'           && <Setup config={config} api={api} onChange={refreshAll} />}
      {tab === 'Rules & Tagging' && <Rules config={config} api={api} onChange={refreshAll} />}
      {tab === 'GST & Tax'       && <GstTax config={config} api={api} start={start} end={end} />}
      {tab === 'Export'          && <ExportTab api={api} start={start} end={end} config={config} />}
    </div>
  )
}

// ─── Overview ────────────────────────────────────────────────────────────────

function Overview({ config, dashboard, api, onChange }) {
  if (config.loading || dashboard.loading) return <div style={muted}>Loading…</div>
  if (config.error)   return <div style={err}>{config.error}</div>
  if (dashboard.error) return <div style={err}>{dashboard.error}</div>

  const v = config.data?.validation
  return (
    <div>
      {v?.warnings?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {v.warnings.map((w, i) => (
            <div key={i} className="error-box" style={{
              marginBottom: 8,
              background: w.level === 'error' ? 'rgba(248,113,113,0.08)' : 'rgba(251,146,60,0.08)',
              borderColor: w.level === 'error' ? 'rgba(248,113,113,0.3)' : 'rgba(251,146,60,0.3)',
              color: w.level === 'error' ? 'var(--danger)' : 'var(--warn)',
            }}>⚠ {w.message}</div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 24 }}>
        {dashboard.data?.map(co => (
          <div key={co.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{co.name}</div>
              {co.gst_registered ? <span style={badge}>GST</span> : <span style={badgeNeutral}>No GST</span>}
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>{co.company_type}</div>
            <div style={{ marginTop: 12, display: 'grid', gap: 4, fontSize: 13 }}>
              <Row label="Home use %"        value={pct(co.home_use_percentage)} />
              <Row label="YTD deductions"    value={fmt(co.ytd_deductions)} />
              <Row label="YTD GST reclaimed" value={fmt(co.ytd_gst_reclaimed)} />
              <Row label="Est. tax saving"   value={fmt(co.estimated_tax_saving)} strong />
              <Row label="Allocations"       value={co.allocation_count} />
            </div>
          </div>
        ))}
      </div>

      <h3 style={h3}>Home use breakdown</h3>
      <div style={card}>
        {Object.values(config.data?.percentages || {}).map(({ company, percentage, breakdown }) => (
          <div key={company.id} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13 }}><strong>{company.name}</strong> — {pct(percentage)}</div>
            {breakdown.map((b, i) => (
              <div key={i} style={{ fontSize: 12, color: 'var(--muted)', paddingLeft: 12 }}>
                {b.space}: base {pct(b.base_pct)} × hours-share × {b.share.toFixed(3)} share = {pct(b.contribution)}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button className={btn} onClick={async () => { await api.hoSeedLeak(); onChange() }}>+ Seed leak repair example</button>
      </div>
    </div>
  )
}

// ─── Expenses ────────────────────────────────────────────────────────────────

function Expenses({ expenses, config, api, onChange }) {
  const [form, setForm] = useState({
    date: localDateStr(),
    description: '',
    category_id: '',
    total_amount_incl_gst: '',
    gst_included: true,
    insurance_reimbursement: 0,
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.hoCreateExpense({
        ...form,
        category_id: form.category_id ? Number(form.category_id) : null,
        total_amount_incl_gst: Number(form.total_amount_incl_gst),
        insurance_reimbursement: Number(form.insurance_reimbursement || 0),
      })
      setForm({ ...form, description: '', total_amount_incl_gst: '', notes: '', insurance_reimbursement: 0 })
      onChange()
    } catch (err) { alert(err.message) }
    finally { setSaving(false) }
  }

  async function remove(id) {
    if (!confirm('Delete this expense and its allocations?')) return
    await api.hoDeleteExpense(id)
    onChange()
  }

  return (
    <div>
      <h3 style={h3}>Add home expense</h3>
      <form onSubmit={submit} style={{ ...card, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
        <Field label="Date">
          <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={inp} required />
        </Field>
        <Field label="Description">
          <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={inp} required />
        </Field>
        <Field label="Category">
          <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} style={inp} required>
            <option value="">— select —</option>
            {(config.data?.categories || []).map(c => (
              <option key={c.id} value={c.id}>{c.name}{!c.gst_claimable ? ' (no GST)' : ''}</option>
            ))}
          </select>
        </Field>
        <Field label="Total (incl. GST)">
          <input type="number" step="0.01" value={form.total_amount_incl_gst} onChange={e => setForm({ ...form, total_amount_incl_gst: e.target.value })} style={inp} required />
        </Field>
        <Field label="GST included?">
          <select value={form.gst_included ? '1' : '0'} onChange={e => setForm({ ...form, gst_included: e.target.value === '1' })} style={inp}>
            <option value="1">Yes</option>
            <option value="0">No</option>
          </select>
        </Field>
        <Field label="Insurance reimbursement">
          <input type="number" step="0.01" value={form.insurance_reimbursement} onChange={e => setForm({ ...form, insurance_reimbursement: e.target.value })} style={inp} />
        </Field>
        <Field label="Notes" span>
          <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={inp} />
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <button type="submit" className={btnPrimary} disabled={saving}>{saving ? 'Saving…' : 'Save & allocate'}</button>
        </div>
      </form>

      <h3 style={h3}>Recent home expenses</h3>
      {expenses.loading ? <div style={muted}>Loading…</div> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {(expenses.data || []).map(e => (
            <div key={e.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{e.description}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {fmtDate(e.date)} · {e.category_name || '—'} · {fmt(e.total_amount_incl_gst)} {e.gst_included ? '(incl GST)' : '(no GST)'}
                    {e.insurance_reimbursement > 0 && ` · Insurance ${fmt(e.insurance_reimbursement)}`}
                  </div>
                  {e.notes && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{e.notes}</div>}
                </div>
                <button className={btnGhost} onClick={() => remove(e.id)}>Delete</button>
              </div>
              <table style={{ ...tbl, marginTop: 10, fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: 'left' }} className="th-row">
                    <th>Company</th><th>Use %</th><th>Allocated (ex GST)</th><th>GST claim</th><th>Tax saving</th>
                  </tr>
                </thead>
                <tbody>
                  {e.allocations.map(a => (
                    <tr key={a.id}>
                      <td>{a.company_name}</td>
                      <td>{pct(a.home_use_percentage)}</td>
                      <td>{fmt(a.allocated_amount_ex_gst)}</td>
                      <td>{fmt(a.gst_claimable)}</td>
                      <td>{fmt(a.estimated_tax_saving)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {(expenses.data || []).length === 0 && <div style={muted}>No home expenses in this period.</div>}
        </div>
      )}
    </div>
  )
}

// ─── Setup (house + spaces + companies) ──────────────────────────────────────

function Setup({ config, api, onChange }) {
  if (config.loading) return <div style={muted}>Loading…</div>
  const { house, spaces, companies, assignments } = config.data || {}

  const [houseEdit, setHouseEdit] = useState({ total_floor_area_sqm: house?.total_floor_area_sqm, address: house?.address || '' })

  async function saveHouse() {
    await api.hoUpdateHouse({
      total_floor_area_sqm: Number(houseEdit.total_floor_area_sqm),
      address: houseEdit.address,
    })
    onChange()
  }

  return (
    <div>
      <h3 style={h3}>House</h3>
      <div style={card}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 10, alignItems: 'end' }}>
          <Field label="Total floor area (sqm)">
            <input type="number" step="0.1" value={houseEdit.total_floor_area_sqm}
              onChange={e => setHouseEdit({ ...houseEdit, total_floor_area_sqm: e.target.value })} style={inp} />
          </Field>
          <Field label="Address">
            <input value={houseEdit.address} onChange={e => setHouseEdit({ ...houseEdit, address: e.target.value })} style={inp} />
          </Field>
          <button onClick={saveHouse} className={btnPrimary}>Save</button>
        </div>
      </div>

      <h3 style={h3}>Business spaces</h3>
      <div style={{ display: 'grid', gap: 10 }}>
        {(spaces || []).map(s => <SpaceRow key={s.id} space={s} api={api} onChange={onChange} />)}
      </div>

      <h3 style={h3}>Companies</h3>
      <div style={card}>
        <table style={tbl}>
          <thead><tr style={{ textAlign: 'left' }} className="th-row">
            <th>Name</th><th>Type</th><th>GST</th><th>Filing</th><th>Tax rate</th><th>Spaces</th>
          </tr></thead>
          <tbody>
            {(companies || []).map(c => {
              const mySpaces = (assignments || []).filter(a => a.company_id === c.id)
                .map(a => spaces.find(s => s.id === a.space_id)?.name).filter(Boolean).join(', ')
              return (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.company_type}</td>
                  <td>{c.gst_registered ? 'Yes' : 'No'}</td>
                  <td>{c.gst_filing_frequency || '—'}</td>
                  <td>{pct(c.tax_rate)}</td>
                  <td>{mySpaces || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SpaceRow({ space, api, onChange }) {
  const [edit, setEdit] = useState(space)
  const [dirty, setDirty] = useState(false)
  function set(k, v) { setEdit({ ...edit, [k]: v }); setDirty(true) }
  async function save() {
    await api.hoUpdateSpace(space.id, {
      ...edit,
      area_sqm: Number(edit.area_sqm),
      hours_per_week_business: edit.hours_per_week_business ? Number(edit.hours_per_week_business) : null,
      is_exclusive_business: !!edit.is_exclusive_business,
    })
    setDirty(false); onChange()
  }
  return (
    <div style={card}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
        <Field label="Name"><input value={edit.name} onChange={e => set('name', e.target.value)} style={inp} /></Field>
        <Field label="Area (sqm)"><input type="number" step="0.1" value={edit.area_sqm} onChange={e => set('area_sqm', e.target.value)} style={inp} /></Field>
        <Field label="Exclusive?">
          <select value={edit.is_exclusive_business ? '1' : '0'} onChange={e => set('is_exclusive_business', e.target.value === '1')} style={inp}>
            <option value="1">Yes</option><option value="0">No</option>
          </select>
        </Field>
        <Field label="Hours/wk biz">
          <input type="number" value={edit.hours_per_week_business ?? ''} onChange={e => set('hours_per_week_business', e.target.value)}
            style={inp} disabled={!!edit.is_exclusive_business} />
        </Field>
        <button onClick={save} className={btnPrimary} disabled={!dirty}>Save</button>
      </div>
      {edit.notes && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{edit.notes}</div>}
    </div>
  )
}

// ─── Rules & Tagging ─────────────────────────────────────────────────────────

function Rules({ config, api, onChange }) {
  const queue = useFetch(() => api.hoReviewQueue(), [])
  const accounts = useFetch(() => api.hoAkahuAccounts(), [])
  const akahu = useFetch(() => api.accounts(), [])

  async function runTag() {
    const r = await api.hoAutoTag()
    alert(`Auto-tagged ${r.tagged} transactions (${r.totalRules} rules applied)`)
    queue.refresh()
  }

  return (
    <div>
      <h3 style={h3}>Auto-tagging</h3>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13 }}>Apply categorisation rules to all unreviewed transactions.</div>
          <button className={btnPrimary} onClick={runTag}>Run auto-tag</button>
        </div>
      </div>

      <h3 style={h3}>Rules</h3>
      <div style={card}>
        <table style={{ ...tbl, fontSize: 12 }}>
          <thead><tr style={{ textAlign: 'left' }} className="th-row">
            <th>Pattern</th><th>Kind</th><th>Category</th><th>Use %</th><th>Confidence</th><th>Notes</th>
          </tr></thead>
          <tbody>
            {(config.data?.rules || []).map(r => {
              const cat = config.data.categories.find(c => c.id === r.suggested_category_id)
              const co  = config.data.companies.find(c => c.id === r.direct_company_id)
              return (
                <tr key={r.id}>
                  <td><code>{r.match_pattern}</code></td>
                  <td>{r.kind}{co ? ` → ${co.name}` : ''}</td>
                  <td>{cat?.name || '—'}</td>
                  <td>{r.suggested_business_use != null ? pct(r.suggested_business_use) : '—'}</td>
                  <td>{r.confidence}</td>
                  <td>{r.notes || ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <h3 style={h3}>Review queue ({queue.data?.length || 0})</h3>
      <div style={card}>
        {queue.loading ? <div style={muted}>Loading…</div> : (
          <table style={{ ...tbl, fontSize: 12 }}>
            <thead><tr style={{ textAlign: 'left' }} className="th-row">
              <th>Date</th><th>Description</th><th>Amount</th><th>Tag</th><th>Company</th><th></th>
            </tr></thead>
            <tbody>
              {(queue.data || []).slice(0, 50).map(t => {
                const co = config.data?.companies.find(c => c.id === t.assigned_company_id)
                const tag = t.is_home_expense ? 'Home' : t.is_direct_business_expense ? 'Direct' : 'Income'
                return (
                  <tr key={t._id}>
                    <td>{fmtDate(t.date)}</td>
                    <td>{t.description}</td>
                    <td style={{ color: t.amount < 0 ? 'var(--danger)' : 'var(--accent)' }}>{fmt(t.amount)}</td>
                    <td>{tag}</td>
                    <td>{co?.name || '—'}</td>
                    <td><button className={btnGhost} onClick={async () => { await api.hoMarkReviewed(t._id); queue.refresh() }}>Confirm</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <h3 style={h3}>Bank account → company mapping</h3>
      <div style={card}>
        <table style={{ ...tbl, fontSize: 12 }}>
          <thead><tr style={{ textAlign: 'left' }} className="th-row">
            <th>Akahu account</th><th>Bank</th><th>Assigned company</th><th></th>
          </tr></thead>
          <tbody>
            {(akahu.data?.items || []).map(acc => {
              const existing = (accounts.data || []).find(a => a.akahu_account_id === acc._id)
              return (
                <AkahuRow key={acc._id} acc={acc} existing={existing} companies={config.data?.companies || []}
                  onSave={async (cid) => { await api.hoSetAkahuAccount({ akahu_account_id: acc._id, company_id: cid, account_name: acc.name, bank_name: acc.connection?.name }); accounts.refresh() }} />
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AkahuRow({ acc, existing, companies, onSave }) {
  const [val, setVal] = useState(existing?.company_id || '')
  return (
    <tr>
      <td>{acc.name}</td>
      <td>{acc.connection?.name}</td>
      <td>
        <select value={val} onChange={e => setVal(e.target.value)} style={inp}>
          <option value="">— unassigned —</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </td>
      <td><button className={btnGhost} onClick={() => onSave(val ? Number(val) : null)}>Save</button></td>
    </tr>
  )
}

// ─── GST & Tax ──────────────────────────────────────────────────────────────

function GstTax({ config, api, start, end }) {
  const companies = config.data?.companies || []
  const [cid, setCid] = useState('')
  const gst = useFetch(() => cid ? api.hoGst(cid, { start, end }) : Promise.resolve(null), [cid, start, end])
  const tax = useFetch(() => cid ? api.hoIncomeTax(cid, { start, end }) : Promise.resolve(null), [cid, start, end])
  const checklist = useFetch(() => cid ? api.hoChecklist(cid, { start, end }) : Promise.resolve(null), [cid, start, end])

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Field label="Company">
          <select value={cid} onChange={e => setCid(e.target.value)} style={inp}>
            <option value="">— select —</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>

      {cid && gst.data && (
        <>
          <h3 style={h3}>GST summary</h3>
          <div style={card}>
            <Row label="Sales (incl GST)"     value={fmt(gst.data.sales_incl_gst)} />
            <Row label="GST collected"        value={fmt(gst.data.gst_collected)} />
            <Row label="Direct expenses (incl GST)" value={fmt(gst.data.direct_expenses_incl_gst)} />
            <Row label="GST on direct"        value={fmt(gst.data.gst_on_direct)} />
            <Row label="Home office GST credit" value={fmt(gst.data.home_office_gst_credit)} />
            <Row label="Total GST credits"    value={fmt(gst.data.total_credits)} />
            <Row label="GST to pay"           value={fmt(gst.data.gst_to_pay)} strong />
            <Row label="Credit/collection ratio" value={gst.data.credit_to_collection_ratio != null ? pct(gst.data.credit_to_collection_ratio) : '—'} />
            {gst.data.ratio_warning && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>⚠ Credit ratio &lt; 10% — possible miscoding (e.g. Drawings should be business expenses)</div>}
          </div>
        </>
      )}

      {cid && tax.data && (
        <>
          <h3 style={h3}>Income tax</h3>
          <div style={card}>
            <Row label="Gross income (ex GST)"        value={fmt(tax.data.gross_income_ex_gst)} />
            <Row label="Direct business expenses"    value={fmt(tax.data.direct_business_expenses_ex_gst)} />
            <Row label="Home office deductions"      value={fmt(tax.data.home_office_deductions)} />
            <Row label="Net taxable profit"          value={fmt(tax.data.net_taxable_profit)} strong />
            <Row label={`Tax @ ${pct(tax.data.tax_rate)}`} value={fmt(tax.data.tax_payable)} strong />
          </div>
        </>
      )}

      {cid && checklist.data && (
        <>
          <h3 style={h3}>Filing checklist</h3>
          <div style={card}>
            {checklist.data.items.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
                <span style={{ width: 16 }}>{item.done === true ? '✓' : item.done === false ? '○' : '—'}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.detail && <span style={{ color: 'var(--muted)', fontSize: 12 }}>{item.detail}</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Export ─────────────────────────────────────────────────────────────────

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

const GST101A_ROWS = [
  ['box5_total_sales',                       'Box 5',  'Total sales (incl. GST)'],
  ['box6_zero_rated',                        'Box 6',  'Zero-rated supplies'],
  ['box9_total_sales_subject_to_gst',        'Box 9',  'Total sales subject to GST'],
  ['box11_gst_collected',                    'Box 11', 'GST collected on sales'],
  ['box13_total_purchases_subject_to_gst',   'Box 13', 'Total purchases subject to GST'],
  ['box14_gst_on_purchases',                 'Box 14', 'GST on purchases (credits)'],
]

function downloadGstReturnCsv(data) {
  const lines = ['Box,Label,Value']
  for (const [key, box, label] of GST101A_ROWS) {
    lines.push(`${box},"${label}",${data.GST101A[key]}`)
  }
  lines.push(`,GST to pay,${data.gst_to_pay}`)
  const safe = data.company.replace(/[^a-z0-9]/gi, '_')
  downloadFile(lines.join('\n'), `GST101A_${safe}_${data.period.start}_${data.period.end}.csv`, 'text/csv')
}

function buildAccountantText(pack) {
  const L = []
  L.push('ACCOUNTANT PACK')
  L.push(`Period: ${pack.period.start || '—'} → ${pack.period.end || '—'}`)
  L.push(`Generated: ${new Date().toLocaleString('en-NZ')}`)
  L.push('')
  L.push('HOUSE')
  L.push(`  Address:    ${pack.house_config?.address || '—'}`)
  L.push(`  Total area: ${pack.house_config?.total_floor_area_sqm} sqm`)
  L.push('')
  L.push('BUSINESS SPACES')
  for (const s of pack.spaces || []) {
    const usage = s.is_exclusive_business ? 'exclusive business use' : `${s.hours_per_week_business || 0} hrs/wk of ${s.total_hours_available}`
    L.push(`  ${s.name}: ${s.area_sqm} sqm — ${usage}${s.notes ? ` (${s.notes})` : ''}`)
  }
  L.push('')
  L.push('COMPANIES')
  for (const c of pack.companies || []) {
    L.push(`  ${c.name} — ${c.gst_registered ? `GST registered (${c.gst_filing_frequency})` : 'not GST registered'} — tax rate ${(c.tax_rate * 100).toFixed(0)}%`)
  }
  L.push('')
  L.push('HOME-USE PERCENTAGES')
  for (const p of Object.values(pack.home_use_percentages || {})) {
    L.push(`  ${p.company.name}: ${(p.percentage * 100).toFixed(3)}%`)
    for (const b of p.breakdown) {
      L.push(`     · ${b.space}: base ${(b.base_pct * 100).toFixed(3)}% × share ${b.share.toFixed(3)} = ${(b.contribution * 100).toFixed(3)}%`)
    }
  }
  L.push('')
  L.push(`HOME EXPENSES (${pack.home_expenses?.length || 0})`)
  let totalDeduct = 0, totalGst = 0, totalSave = 0
  for (const e of pack.home_expenses || []) {
    L.push(`  ${e.date}  ${e.description}  $${e.total_amount_incl_gst.toFixed(2)} ${e.gst_included ? '(incl GST)' : '(no GST)'} — ${e.category_name || 'uncategorised'}`)
    if (e.insurance_reimbursement > 0) L.push(`     Insurance reimbursement: $${e.insurance_reimbursement.toFixed(2)}`)
    for (const a of e.allocations) {
      L.push(`     → ${a.company_name}: $${a.allocated_amount_ex_gst.toFixed(2)} deduction, $${a.gst_claimable.toFixed(2)} GST credit, $${a.estimated_tax_saving.toFixed(2)} tax saving`)
      totalDeduct += a.income_tax_deduction
      totalGst    += a.gst_claimable
      totalSave   += a.estimated_tax_saving
    }
  }
  L.push('')
  L.push('TOTALS')
  L.push(`  Total deductions: $${totalDeduct.toFixed(2)}`)
  L.push(`  Total GST credits: $${totalGst.toFixed(2)}`)
  L.push(`  Total estimated tax saving: $${totalSave.toFixed(2)}`)
  L.push('')
  L.push('PER-COMPANY DASHBOARD')
  for (const c of pack.company_dashboard || []) {
    L.push(`  ${c.name}: deductions $${c.ytd_deductions.toFixed(2)}, GST reclaimed $${c.ytd_gst_reclaimed.toFixed(2)}, tax saving $${c.estimated_tax_saving.toFixed(2)}`)
  }
  return L.join('\n')
}

function ExportTab({ api, start, end, config }) {
  const [pack, setPack] = useState(null)
  const [gstReturn, setGstReturn] = useState(null)
  const [cid, setCid] = useState('')
  const [loadingPack, setLoadingPack] = useState(false)
  const [copied, setCopied] = useState('')

  async function downloadAllocationsCsv() {
    const token = window.Clerk?.session ? await window.Clerk.session.getToken() : null
    const res = await fetch(`/api/ho/export.csv?start=${start}&end=${end}`, { headers: { Authorization: `Bearer ${token}` } })
    const text = await res.text()
    downloadFile(text, `allocations_${start}_${end}.csv`, 'text/csv')
  }

  async function generateGst() {
    setGstReturn(null)
    setGstReturn(await api.hoGstReturn(cid, { start, end }))
  }

  async function generatePack() {
    setLoadingPack(true)
    try { setPack(await api.hoAccountantPack({ start, end })) }
    finally { setLoadingPack(false) }
  }

  async function copyGstBoxes() {
    if (!gstReturn) return
    const text = GST101A_ROWS.map(([k, b, l]) => `${b}\t${l}\t${gstReturn.GST101A[k]}`).join('\n') + `\nGST to pay\t\t${gstReturn.gst_to_pay}`
    await navigator.clipboard.writeText(text)
    setCopied('gst'); setTimeout(() => setCopied(''), 2000)
  }

  return (
    <div>
      <h3 style={h3}>Allocations CSV</h3>
      <div style={card}>
        <div className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>
          One row per company per allocation for {start} → {end}. Open in Excel/Google Sheets.
        </div>
        <button className={btnPrimary} onClick={downloadAllocationsCsv}>Download allocations.csv</button>
      </div>

      <h3 style={h3}>GST101A return summary</h3>
      <div style={card}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'end', marginBottom: 16 }}>
          <Field label="Company">
            <select value={cid} onChange={e => setCid(e.target.value)} style={inp}>
              <option value="">— select —</option>
              {(config.data?.companies || []).filter(c => c.gst_registered).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <button className={btnPrimary} disabled={!cid} onClick={generateGst}>Generate</button>
        </div>

        {gstReturn && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18 }}>{gstReturn.company}</div>
                <div className="text-muted" style={{ fontSize: 12 }}>Period {gstReturn.period.start} → {gstReturn.period.end}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={btnGhost} onClick={copyGstBoxes}>{copied === 'gst' ? '✓ Copied' : 'Copy for myIR'}</button>
                <button className={btnPrimary} onClick={() => downloadGstReturnCsv(gstReturn)}>Download CSV</button>
              </div>
            </div>
            <table style={tbl}>
              <thead><tr><th>Box</th><th>Label</th><th style={{ textAlign: 'right' }}>Amount (NZD)</th></tr></thead>
              <tbody>
                {GST101A_ROWS.map(([key, box, label]) => (
                  <tr key={key}>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>{box}</td>
                    <td>{label}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{fmt(Number(gstReturn.GST101A[key]))}</td>
                  </tr>
                ))}
                <tr>
                  <td></td>
                  <td style={{ fontWeight: 600 }}>GST to pay</td>
                  <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', fontWeight: 600, color: 'var(--accent)' }}>{fmt(Number(gstReturn.gst_to_pay))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <h3 style={h3}>Accountant pack</h3>
      <div style={card}>
        <div className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>
          Full snapshot of house config, percentages, companies, expenses and per-company totals — formatted for emailing to your accountant.
        </div>
        <button className={btnPrimary} onClick={generatePack} disabled={loadingPack}>
          {loadingPack ? 'Generating…' : 'Generate'}
        </button>

        {pack && (
          <>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12, marginTop: 16,
            }}>
              <PackStat label="Period"      value={`${pack.period.start || '—'} → ${pack.period.end || '—'}`} />
              <PackStat label="Companies"   value={pack.companies?.length || 0} />
              <PackStat label="Spaces"      value={pack.spaces?.length || 0} />
              <PackStat label="Home expenses" value={pack.home_expenses?.length || 0} />
              <PackStat label="Total deductions"
                value={fmt((pack.company_dashboard || []).reduce((s, c) => s + c.ytd_deductions, 0))} />
              <PackStat label="Total GST credits"
                value={fmt((pack.company_dashboard || []).reduce((s, c) => s + c.ytd_gst_reclaimed, 0))} />
              <PackStat label="Est. tax saving"
                value={fmt((pack.company_dashboard || []).reduce((s, c) => s + c.estimated_tax_saving, 0))} accent />
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className={btnPrimary} onClick={() => downloadFile(buildAccountantText(pack), `accountant_pack_${start}_${end}.txt`, 'text/plain')}>
                Download as text (.txt)
              </button>
              <button className={btnGhost} onClick={downloadAllocationsCsv}>+ Allocations CSV</button>
              <button className={btnGhost} onClick={() => downloadFile(JSON.stringify(pack, null, 2), `accountant_pack_${start}_${end}.json`, 'application/json')}>
                Raw JSON (advanced)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function PackStat({ label, value, accent }) {
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12 }}>
      <div className="stat-label" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: accent ? 'var(--accent)' : 'var(--text)' }}>{value}</div>
    </div>
  )
}

// ─── tiny shared atoms ───────────────────────────────────────────────────────

const inp = {
  padding: '8px 12px',
  border: '1px solid var(--border2)',
  background: 'var(--surface2)',
  color: 'var(--text)',
  borderRadius: 'var(--radius)',
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  outline: 'none',
}
const card = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 20,
}
const h3 = {
  fontFamily: 'var(--font-serif)',
  fontSize: 20,
  color: 'var(--text)',
  marginTop: 24,
  marginBottom: 14,
  letterSpacing: '-0.3px',
}
const muted = { color: 'var(--muted)', fontSize: 14, padding: '24px 0' }
const err = { color: 'var(--danger)', fontSize: 14, padding: 14 }
const btn = 'btn btn-ghost'
const btnPrimary = 'btn btn-primary'
const btnGhost = 'btn btn-ghost'
const badge = {
  background: 'rgba(52,211,153,0.15)',
  color: 'var(--accent)',
  padding: '3px 9px',
  borderRadius: 20,
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
}
const badgeNeutral = {
  ...badge,
  background: 'var(--surface2)',
  color: 'var(--muted)',
  border: '1px solid var(--border2)',
}
const tbl = { width: '100%', fontSize: 13, borderCollapse: 'collapse', color: 'var(--text)' }
const th = { color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, textAlign: 'left', padding: '8px 8px 8px 0', borderBottom: '1px solid var(--border)' }
const td = { padding: '10px 8px 10px 0', borderBottom: '1px solid var(--border)' }
const codeJson = {
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  padding: 14,
  borderRadius: 'var(--radius)',
  overflow: 'auto',
  maxHeight: 400,
}

function Field({ label, children, span }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: span ? '1 / -1' : undefined }}>
      <span className="stat-label" style={{ marginBottom: 0 }}>{label}</span>
      {children}
    </label>
  )
}

function Row({ label, value, strong }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
      <span className="text-muted">{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: strong ? 600 : 400, color: strong ? 'var(--accent)' : 'var(--text)' }}>{value}</span>
    </div>
  )
}
