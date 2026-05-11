import { useAuth } from '@clerk/clerk-react'

const BASE = import.meta.env.VITE_API_URL || ''

// Hook that returns auth-aware api helpers
export function useApi() {
  const { getToken } = useAuth()

  async function get(path) {
    const token = await getToken()
    const res = await fetch(`${BASE}/api${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`)
    return res.json()
  }

  async function request(method, path, body) {
    const token = await getToken()
    const res = await fetch(`${BASE}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`)
    return res.json()
  }

  const post  = (path, body) => request('POST',  path, body)
  const patch = (path, body) => request('PATCH', path, body)
  const put   = (path, body) => request('PUT',   path, body)
  const del   = (path) => request('DELETE', path, {})

  return {
    // Home Office endpoints
    hoConfig:        () => get('/ho/config'),
    hoUpdateHouse:   (body) => put('/ho/house', body),
    hoUpdateSpace:   (id, body) => put(`/ho/space/${id}`, body),
    hoExpenses:      (q = {}) => get(`/ho/expenses?${new URLSearchParams(q)}`),
    hoCreateExpense: (body) => post('/ho/expenses', body),
    hoDeleteExpense: (id) => del(`/ho/expenses/${id}`),
    hoReallocate:    (id) => post(`/ho/expenses/${id}/reallocate`, {}),
    hoSeedLeak:      () => post('/ho/seed-leak', {}),
    hoAutoTag:       () => post('/ho/auto-tag', {}),
    hoReviewQueue:   () => get('/ho/review-queue'),
    hoMarkReviewed:  (id) => post(`/ho/review/${encodeURIComponent(id)}`, {}),
    hoDashboard:     (q = {}) => get(`/ho/dashboard?${new URLSearchParams(q)}`),
    hoGst:           (cid, q) => get(`/ho/gst/${cid}?${new URLSearchParams(q)}`),
    hoIncomeTax:     (cid, q) => get(`/ho/income-tax/${cid}?${new URLSearchParams(q)}`),
    hoAkahuAccounts: () => get('/ho/akahu-accounts'),
    hoSetAkahuAccount: (body) => post('/ho/akahu-accounts', body),
    hoGstReturn:     (cid, q) => get(`/ho/gst-return/${cid}?${new URLSearchParams(q)}`),
    hoAccountantPack:(q) => get(`/ho/accountant-pack?${new URLSearchParams(q)}`),
    hoChecklist:     (cid, q) => get(`/ho/checklist/${cid}?${new URLSearchParams(q)}`),
    accounts:     () => get('/accounts'),
    summary:      () => get('/summary'),
    properties:   () => get('/properties'),
    transactions: (start, end) => {
      const params = new URLSearchParams()
      if (start) params.set('start', start)
      if (end)   params.set('end', end)
      return get(`/transactions?${params}`)
    },
    spending: (start, end) => {
      const p = new URLSearchParams()
      if (start) p.set('start', start)
      if (end)   p.set('end',   end)
      return get(`/spending?${p}`)
    },
    pending:         () => get('/transactions/pending'),
    syncStatus:      () => get('/sync/status'),
    categorise:      () => post('/categorise', {}),
    categories:      () => get('/categories'),
    patchCategory:   (id, category) => patch(`/transactions/${id}/category`, { category }),
    ask:             (question, context) => post('/ask', { question, context }),
  }
}

export function fmt(amount, currency = 'NZD') {
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
}

export function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })
}

export function accountTypeLabel(type) {
  return { checking: 'Everyday', savings: 'Savings', mortgage: 'Mortgage', credit: 'Credit', investment: 'Investment' }[type] || type
}
