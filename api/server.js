import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
dotenv.config()

import express from 'express'
import cors from 'cors'
import Anthropic from '@anthropic-ai/sdk'
import { clerkMiddleware, requireAuth, getAuth, createClerkClient } from '@clerk/express'
import { getCached, setCached, cacheStatus, clearCache, deleteCacheKey, TTL_24H, TTL_30D } from './cache.js'
import { getLastSyncDate, setLastSyncDate, insertTransactions, queryTransactions, dbStats, getUncategorised, saveAiCategories, updateManualCategory, getAllCategories, getCategorySpending, normaliseCategories, STANDARD_CATEGORIES, getCustomAccountName, setCustomAccountName, getAllCustomAccountNames } from './db.js'
import personal from './personalLoader.js'
import {
  initHomeOfficeSchema, seedHomeOfficeData, seedLeakExample,
  calculateHomeUsePercentages, validationWarnings,
  createHomeExpense, listHomeExpenses, deleteHomeExpense, allocateExpense,
  autoTagTransactions, getReviewQueue, markReviewed,
  getCompanyDashboard, getGstSummary, getIncomeTaxSummary,
  exportAllocationsCsv, getGstReturnFormatted, getAccountantPack, getFilingChecklist,
  listCompanies, listSpaces, listAssignments, listCategories, listRules,
  getHouseConfig, updateHouseConfig, updateSpace,
  listAkahuAccounts, setAkahuAccountCompany,
} from './homeOffice.js'

const app = express()
app.use(cors())
app.use(express.json())
// @clerk/express needs CLERK_PUBLISHABLE_KEY — our .env.local uses the VITE_ prefix for the frontend,
// so we pass it explicitly here
app.use(clerkMiddleware({
  publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY,
  secretKey:      process.env.CLERK_SECRET_KEY,
}))

const clerkBackend = createClerkClient({
  publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY,
  secretKey:      process.env.CLERK_SECRET_KEY,
})

const ALLOWED_EMAILS = personal.allowedEmails || []

// Simple in-memory cache so we don't hit Clerk API on every request
const emailCache = new Map()

async function allowlistOnly(req, res, next) {
  const { userId } = getAuth(req)
  if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

  let email = emailCache.get(userId)
  if (!email) {
    const user = await clerkBackend.users.getUser(userId)
    email = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)?.emailAddress || ''
    emailCache.set(userId, email)
  }

  if (!ALLOWED_EMAILS.includes(email)) {
    return res.status(403).json({ error: 'Access denied' })
  }
  next()
}

// All /api/* routes require a valid Clerk session AND an allowed email
app.use('/api', requireAuth(), allowlistOnly)

const AKAHU_BASE = 'https://api.akahu.io/v1'
const APP_TOKEN  = process.env.AKAHU_APP_TOKEN
const USER_TOKEN = process.env.AKAHU_USER_TOKEN
const anthropic  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Seed property data — loaded from api/personal.js (gitignored) ───────────

function getProperties() {
  const cached = getCached('properties', TTL_30D)
  if (cached) return cached
  const seed = personal.properties || []
  setCached('properties', seed, TTL_30D)
  return seed
}

// ─── Akahu helpers with 24hr cache ───────────────────────────────────────────

async function akahuFetch(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${USER_TOKEN}`, 'X-Akahu-ID': APP_TOKEN },
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.message || 'Akahu API error')
  return json
}

async function akahu(path, params = {}) {
  const key = path + JSON.stringify(params)
  const cached = getCached(key, TTL_24H)
  if (cached) { console.log(`[cache] HIT  ${path}`); return cached }
  console.log(`[cache] MISS ${path} — fetching from Akahu`)

  const url = new URL(`${AKAHU_BASE}${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const json = await akahuFetch(url.toString())
  setCached(key, json, TTL_24H)
  return json
}

// Fetches all pages of a paginated endpoint (cursor.next is a token, not a URL)
async function akahuAll(path, params = {}) {
  const cacheKey = path + ':all:' + JSON.stringify(params)
  const cached = getCached(cacheKey, TTL_24H)
  if (cached) { console.log(`[cache] HIT  ${path} (all pages)`); return cached }
  console.log(`[cache] MISS ${path} — paginating all pages`)

  const items = []
  let cursor = null

  do {
    const url = new URL(`${AKAHU_BASE}${path}`)
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    if (cursor) url.searchParams.set('cursor', cursor)

    const json = await akahuFetch(url.toString())
    items.push(...(json.items || []))
    cursor = json.cursor?.next || null
    if (cursor) console.log(`[paginate] ${path} — ${items.length} fetched, continuing…`)
  } while (cursor)

  const result = { success: true, items }
  setCached(cacheKey, result, TTL_24H)
  console.log(`[paginate] ${path} complete — ${items.length} total items`)
  return result
}

// ─── Internal-transfer helpers ───────────────────────────────────────────────

function buildOwnAccountNums(accounts) {
  return accounts
    .filter(a => a.formatted_account && a.formatted_account !== 'N/A')
    .map(a => a.formatted_account.replace(/[-\s]/g, '').toLowerCase())
    .filter(n => n.length >= 6)
}

function isInternalTransfer(tx, ownNums) {
  if (tx.type === 'TRANSFER') return true
  const desc = (tx.description || '').replace(/[-\s]/g, '').toLowerCase()
  return ownNums.some(n => desc.includes(n))
}

function tagTransactions(txs, ownNums) {
  return txs.map(t => ({ ...t, _internal: isInternalTransfer(t, ownNums) }))
}

// ─── Sync: fetch from Akahu and persist to SQLite ────────────────────────────

async function syncTransactions({ force = false } = {}) {
  const today = new Date().toISOString().split('T')[0]
  const lastSync = getLastSyncDate()

  if (!force && lastSync === today) {
    console.log('[sync] already synced today — skipping')
    return { skipped: true, lastSync }
  }

  // On first run fetch 2 years of history; on subsequent runs only fetch the delta
  const INITIAL_START = '2023-01-01'
  const start = lastSync || INITIAL_START
  console.log(`[sync] starting — ${start} → ${today}`)

  const [txData, accountsData] = await Promise.all([
    akahuAll('/transactions', { start, end: today }),
    akahu('/accounts'),
  ])

  const ownNums = buildOwnAccountNums(accountsData.items || [])
  const tagged  = tagTransactions(txData.items || [], ownNums)
  const inserted = insertTransactions(tagged)

  setLastSyncDate(today)
  console.log(`[sync] done — ${inserted} new rows inserted (${tagged.length} fetched)`)
  return { inserted, fetched: tagged.length, from: start, to: today, lastSync: today }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get('/api/accounts', async (req, res) => {
  try {
    const akahuAccounts = await akahu('/accounts')
    const customNames = getAllCustomAccountNames()
    const customNameMap = Object.fromEntries(customNames.map(cn => [cn.account_id, cn.custom_name]))
    
    const enriched = {
      ...akahuAccounts,
      items: (akahuAccounts.items || []).map(acc => ({
        ...acc,
        _displayName: customNameMap[acc._id] || acc.name,
        _customName: customNameMap[acc._id] || null
      }))
    }
    res.json(enriched)
  }
  catch (err) { res.status(500).json({ error: err.message }) }
})

// PATCH /api/accounts/:id/name — save custom account name
app.patch('/api/accounts/:id/name', (req, res) => {
  try {
    const { customName } = req.body
    if (!customName || customName.trim().length === 0) return res.status(400).json({ error: 'customName required' })
    const result = setCustomAccountName(req.params.id, customName.trim())
    res.json(result)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/spending?start=&end= — category spending aggregated from DB
app.get('/api/spending', (req, res) => {
  try {
    const { start, end } = req.query
    res.json(getCategorySpending({ start: start || null, end: end || null }))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/categories — all distinct categories in DB (for dropdowns)
app.get('/api/categories', (req, res) => {
  try { res.json(getAllCategories()) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

// PATCH /api/transactions/:id/category — save a manual category override (bulk-matches by description)
app.patch('/api/transactions/:id/category', (req, res) => {
  try {
    const { category } = req.body
    if (!category) return res.status(400).json({ error: 'category required' })
    const result = updateManualCategory(req.params.id, category)
    res.json({ ok: true, updated: result.updated, description: result.description })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/transactions', (req, res) => {
  try {
    const items = queryTransactions({ start: req.query.start, end: req.query.end })
    res.json({ items })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/transactions/pending', async (req, res) => {
  try { res.json(await akahu('/transactions/pending')) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/properties — property portfolio (30-day cache)
app.get('/api/properties', (req, res) => {
  res.json(getProperties())
})

// PUT /api/properties/:index — update a single property value manually
app.put('/api/properties/:index', (req, res) => {
  const idx = parseInt(req.params.index)
  const { value, source } = req.body
  const props = getProperties()
  if (idx < 0 || idx >= props.length) return res.status(400).json({ error: 'invalid index' })
  props[idx] = { ...props[idx], value, source: source || 'Manual update', sourceDate: new Date().toISOString().split('T')[0] }
  setCached('properties', props, TTL_30D)
  res.json(props)
})

// DELETE /api/properties/cache — force refresh (clears 30-day lock)
app.delete('/api/properties/cache', (req, res) => {
  deleteCacheKey('properties')
  res.json({ cleared: true, message: 'Property cache cleared — seed values will be reloaded on next request.' })
})

// GET /api/summary — net worth + cash flow + per-account + property totals
app.get('/api/summary', async (req, res) => {
  try {
    const [accountsData, properties] = await Promise.all([
      akahu('/accounts'),
      Promise.resolve(getProperties()),
    ])
    const accounts = accountsData.items || []
    const classified = accounts.map(acc => ({ ...acc, _type: classifyAccount(acc) }))

    const bankAssets      = classified.filter(a => !['loan','mortgage','credit'].includes(a._type))
    const liabilities     = classified.filter(a => ['loan','mortgage','credit'].includes(a._type))
    const totalBankAssets = bankAssets.reduce((s, a) => s + (a.balance?.current || 0), 0)
    const totalLiabilities = liabilities.reduce((s, a) => s + Math.abs(a.balance?.current || 0), 0)
    const totalPropertyValue = properties.reduce((s, p) => s + p.value, 0)
    const totalAssets = totalBankAssets + totalPropertyValue
    const netWorth = totalAssets - totalLiabilities

    const now      = new Date()
    const start30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const end30d   = now.toISOString().split('T')[0]
    const transactions = queryTransactions({ start: start30d, end: end30d })
    const external     = transactions.filter(t => !t._internal)

    const income   = external.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
    const expenses = external.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)

    const byAccount = {}
    external.forEach(t => {
      if (!byAccount[t._account]) byAccount[t._account] = { income: 0, expenses: 0, txCount: 0 }
      if (t.amount > 0) byAccount[t._account].income += t.amount
      else byAccount[t._account].expenses += Math.abs(t.amount)
      byAccount[t._account].txCount++
    })

    const classifiedWithStats = classified.map(acc => ({
      ...acc,
      stats30d: byAccount[acc._id] || { income: 0, expenses: 0, txCount: 0 },
    }))

    const categories = {}
    external.filter(t => t.amount < 0).forEach(t => {
      const cat = t.category?.groups?.personal_finance?.name || t.category?.name || t.ai_category || 'Uncategorised'
      categories[cat] = (categories[cat] || 0) + Math.abs(t.amount)
    })

    res.json({
      netWorth,
      totalAssets,
      totalBankAssets,
      totalPropertyValue,
      totalLiabilities,
      income30d: income,
      expenses30d: expenses,
      savingsRate: income > 0 ? ((income - expenses) / income) * 100 : 0,
      accounts: classifiedWithStats,
      properties,
      categories: Object.entries(categories)
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount),
      transactionCount: external.length,
      transferCount: transactions.length - external.length,
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/sync/status — last sync date + DB stats
app.get('/api/sync/status', (req, res) => res.json(dbStats()))

// POST /api/sync — trigger a delta sync (or force full re-sync with ?force=1)
app.post('/api/sync', async (req, res) => {
  try {
    const result = await syncTransactions({ force: req.query.force === '1' })
    res.json(result)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/categorise — AI-categorise all uncategorised transactions in batches
app.post('/api/categorise', async (req, res) => {
  try {
    const pending = getUncategorised()
    if (pending.length === 0) return res.json({ categorised: 0, message: 'Nothing to categorise' })

    const BATCH = 50
    const NZ_CATEGORIES = STANDARD_CATEGORIES.join(', ')

    let totalCategorised = 0

    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH)
      console.log(`[categorise] batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(pending.length / BATCH)} (${batch.length} transactions)`)

      const txList = batch.map(t => ({
        id:          t._id,
        description: t.description || '',
        merchant:    t.merchant_name || '',
        amount:      Math.abs(t.amount),
      }))

      const prompt = `You are categorising NZ bank transactions for a personal finance app.

Assign each transaction ONE category from this list:
${NZ_CATEGORIES}

Transactions (JSON array):
${JSON.stringify(txList, null, 2)}

Respond with ONLY a valid JSON array, no explanation, no markdown. Format:
[{"id":"<transaction_id>","category":"<category>"},...]`

      const response = await anthropic.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages:   [{ role: 'user', content: prompt }],
      })

      const raw = response.content[0].text.trim()
      // Strip markdown code fences if the model wrapped the JSON
      const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      const results = JSON.parse(text).map(r => ({ _id: r.id, category: r.category }))
      saveAiCategories(results)
      totalCategorised += results.length
    }

    console.log(`[categorise] done — ${totalCategorised} transactions categorised`)
    res.json({ categorised: totalCategorised, total: pending.length })
  } catch (err) {
    console.error('[categorise] error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/cache
app.get('/api/cache', (req, res) => res.json(cacheStatus()))

// DELETE /api/cache
app.delete('/api/cache', (req, res) => { clearCache(); res.json({ cleared: true }) })

// POST /api/ask — Claude AI financial analysis
app.post('/api/ask', async (req, res) => {
  const { question, context } = req.body
  if (!question) return res.status(400).json({ error: 'question required' })

  try {
    const who = personal.aiContext?.userName ? ` for ${personal.aiContext.userName}` : ''
    const ctx = personal.aiContext?.businessSummary
      ? `\nContext about the user: ${personal.aiContext.businessSummary}. Flag any rental income patterns, unusual expenses, or cash flow concerns.`
      : ''
    const systemPrompt = `You are a sharp personal finance advisor${who}, based in Auckland, New Zealand.
You have access to real-time financial data from all connected NZ bank accounts, investments, and loans.
Be direct, specific, and actionable. Reference actual numbers from the data. Use NZD.
Keep responses concise (3-5 sentences or bullet points max) unless a detailed breakdown is requested.${ctx}`

    const userMessage = context
      ? `Financial data:\n${JSON.stringify(context, null, 2)}\n\nQuestion: ${question}`
      : question

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })
    res.json({ answer: response.content[0].text })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function classifyAccount(acc) {
  const name     = (acc.name || '').toLowerCase()
  const connName = (acc.connection?.name || '').toLowerCase()
  const type     = (acc.type || '').toUpperCase()
  const attrs    = acc.attributes || []
  if (type === 'LOAN' || name.includes('loan') || name.includes('mortgage') || name.includes('home loan')) return 'mortgage'
  if (type === 'CREDIT_CARD' || name.includes('credit') || attrs.includes('CREDIT_CARD')) return 'credit'
  if (name.includes('invest') || name.includes('kiwisaver') || connName.includes('sharesies') || connName.includes('investnow')) return 'investment'
  if (type === 'SAVINGS' || name.includes('sav')) return 'savings'
  return 'checking'
}

// ─── Home Office routes ──────────────────────────────────────────────────────

app.get('/api/ho/config', (req, res) => {
  try {
    res.json({
      house: getHouseConfig(),
      spaces: listSpaces(),
      companies: listCompanies(),
      assignments: listAssignments(),
      categories: listCategories(),
      rules: listRules(),
      percentages: calculateHomeUsePercentages(),
      validation: validationWarnings(),
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.put('/api/ho/house', (req, res) => {
  try { res.json(updateHouseConfig(req.body)) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.put('/api/ho/space/:id', (req, res) => {
  try { res.json(updateSpace(Number(req.params.id), req.body)) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/ho/expenses', (req, res) => {
  try { res.json(listHomeExpenses(req.query)) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/ho/expenses', (req, res) => {
  try {
    const id = createHomeExpense(req.body)
    const result = allocateExpense(id)
    res.json({ id, ...result })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete('/api/ho/expenses/:id', (req, res) => {
  try { deleteHomeExpense(Number(req.params.id)); res.json({ ok: true }) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/ho/expenses/:id/reallocate', (req, res) => {
  try { res.json(allocateExpense(Number(req.params.id))) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/ho/seed-leak', (req, res) => {
  try { res.json({ id: seedLeakExample() }) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/ho/auto-tag', (req, res) => {
  try { res.json(autoTagTransactions()) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/ho/review-queue', (req, res) => {
  try { res.json(getReviewQueue()) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/ho/review/:id', (req, res) => {
  try { markReviewed(req.params.id); res.json({ ok: true }) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/ho/dashboard', (req, res) => {
  try { res.json(getCompanyDashboard(req.query)) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/ho/gst/:companyId', (req, res) => {
  try { res.json(getGstSummary(Number(req.params.companyId), req.query)) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/ho/income-tax/:companyId', (req, res) => {
  try { res.json(getIncomeTaxSummary(Number(req.params.companyId), req.query)) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/ho/akahu-accounts', (req, res) => {
  try { res.json(listAkahuAccounts()) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/ho/akahu-accounts', (req, res) => {
  try {
    const { akahu_account_id, company_id, account_name, bank_name } = req.body
    res.json(setAkahuAccountCompany(akahu_account_id, company_id, account_name, bank_name))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/ho/export.csv', (req, res) => {
  try {
    res.set('Content-Type', 'text/csv')
    res.set('Content-Disposition', 'attachment; filename="allocations.csv"')
    res.send(exportAllocationsCsv(req.query))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/ho/gst-return/:companyId', (req, res) => {
  try { res.json(getGstReturnFormatted(Number(req.params.companyId), req.query)) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/ho/accountant-pack', (req, res) => {
  try { res.json(getAccountantPack(req.query)) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/ho/checklist/:companyId', (req, res) => {
  try { res.json(getFilingChecklist(Number(req.params.companyId), req.query)) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || process.env.API_PORT || 3001
const server = app.listen(PORT, () => {
  console.log(`Pūtea API running on :${PORT}`)
  normaliseCategories()
  initHomeOfficeSchema()
  seedHomeOfficeData(personal.homeOffice || {})
  syncTransactions().catch(e => console.error('[sync] startup sync failed:', e.message))
})

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Set PORT or API_PORT to a free port and retry.`)
    process.exit(1)
  }
  console.error('Server error:', err)
  process.exit(1)
})
