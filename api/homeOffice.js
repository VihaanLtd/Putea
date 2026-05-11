// Home Office Expense Tracker — schema, seeds, allocation engine, exports.
// Implements phases 1–7 from claude-code-instructions-home-expense-tracker.md
import { getDb } from './db.js'

const GST_RATE = 0.15

// ─── Schema ──────────────────────────────────────────────────────────────────

export function initHomeOfficeSchema() {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS house_config (
      id INTEGER PRIMARY KEY,
      total_floor_area_sqm REAL NOT NULL,
      address TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS business_spaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      area_sqm REAL NOT NULL,
      is_exclusive_business INTEGER NOT NULL DEFAULT 0,
      hours_per_week_business INTEGER,
      total_hours_available INTEGER NOT NULL DEFAULT 168,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      ird_number TEXT,
      gst_registered INTEGER NOT NULL DEFAULT 0,
      gst_filing_frequency TEXT,
      tax_rate REAL NOT NULL DEFAULT 0.28,
      company_type TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS company_space_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      space_id   INTEGER NOT NULL REFERENCES business_spaces(id) ON DELETE CASCADE,
      usage_share REAL,
      UNIQUE(company_id, space_id)
    );

    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      gst_claimable INTEGER NOT NULL DEFAULT 1,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS home_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id TEXT,
      date TEXT NOT NULL,
      description TEXT,
      category_id INTEGER REFERENCES expense_categories(id),
      total_amount_incl_gst REAL NOT NULL,
      gst_included INTEGER NOT NULL DEFAULT 1,
      insurance_reimbursement REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expense_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      home_expense_id INTEGER NOT NULL REFERENCES home_expenses(id) ON DELETE CASCADE,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      home_use_percentage REAL NOT NULL,
      allocated_amount_ex_gst REAL NOT NULL,
      gst_claimable REAL NOT NULL DEFAULT 0,
      income_tax_deduction REAL NOT NULL,
      estimated_tax_saving REAL NOT NULL,
      created_at TEXT NOT NULL,
      auto INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS categorisation_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_pattern TEXT NOT NULL,
      suggested_category_id INTEGER REFERENCES expense_categories(id),
      suggested_business_use REAL,
      confidence TEXT NOT NULL DEFAULT 'suggest',
      notes TEXT,
      direct_company_id INTEGER REFERENCES companies(id),
      kind TEXT NOT NULL DEFAULT 'home'   -- 'home' | 'direct' | 'income' | 'personal'
    );

    CREATE TABLE IF NOT EXISTS akahu_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      akahu_account_id TEXT NOT NULL UNIQUE,
      company_id INTEGER REFERENCES companies(id),
      account_name TEXT,
      bank_name TEXT
    );

    CREATE TABLE IF NOT EXISTS allocation_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      home_expense_id INTEGER,
      action TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL
    );
  `)

  // Add columns to transactions for tagging
  const cols = db.prepare('PRAGMA table_info(transactions)').all().map(c => c.name)
  if (!cols.includes('is_home_expense'))           db.exec('ALTER TABLE transactions ADD COLUMN is_home_expense INTEGER NOT NULL DEFAULT 0')
  if (!cols.includes('is_direct_business_expense'))db.exec('ALTER TABLE transactions ADD COLUMN is_direct_business_expense INTEGER NOT NULL DEFAULT 0')
  if (!cols.includes('assigned_company_id'))       db.exec('ALTER TABLE transactions ADD COLUMN assigned_company_id INTEGER')
  if (!cols.includes('category_override_id'))      db.exec('ALTER TABLE transactions ADD COLUMN category_override_id INTEGER')
  if (!cols.includes('reviewed'))                  db.exec('ALTER TABLE transactions ADD COLUMN reviewed INTEGER NOT NULL DEFAULT 0')
  if (!cols.includes('reviewed_at'))               db.exec('ALTER TABLE transactions ADD COLUMN reviewed_at TEXT')
}

// ─── Seeds ────────────────────────────────────────────────────────────────────

// NZ expense categories — generic tax facts, not personal data.
const CATEGORY_SEED = [
  ['Repairs & Maintenance', 1, null],
  ['Insurance (house)',     0, 'GST-exempt in NZ'],
  ['Council Rates',         0, 'Local authority rates GST-exempt'],
  ['Electricity',           1, null],
  ['Gas',                   1, null],
  ['Water',                 1, null],
  ['Internet',              1, null],
  ['Mortgage Interest',     0, 'Financial services exempt'],
  ['Body Corporate Levies', 0, null],
  ['Cleaning',              1, null],
  ['Security/Alarm',        1, null],
  ['Depreciation (building)', 0, null],
  ['Other',                 1, null],
]

// Seed from supplied personal config. Caller (server.js) passes the data;
// nothing personal lives in this file.
export function seedHomeOfficeData(config = {}) {
  const db = getDb()
  const now = new Date().toISOString()
  const house       = config.house       || { total_floor_area_sqm: 150, address: '' }
  const companies   = config.companies   || []
  const spaces      = config.spaces      || []
  const assignments = config.assignments || []
  const rules       = config.rules       || []

  if (!db.prepare('SELECT 1 FROM house_config WHERE id = 1').get()) {
    db.prepare('INSERT INTO house_config (id, total_floor_area_sqm, address, updated_at) VALUES (?, ?, ?, ?)')
      .run(1, house.total_floor_area_sqm, house.address || null, now)
  }

  const insertCat = db.prepare('INSERT OR IGNORE INTO expense_categories (name, gst_claimable, notes) VALUES (?, ?, ?)')
  for (const [name, gst, notes] of CATEGORY_SEED) insertCat.run(name, gst, notes)

  const insertCo = db.prepare(`INSERT OR IGNORE INTO companies
    (name, gst_registered, gst_filing_frequency, tax_rate, company_type, is_active)
    VALUES (@name, @gst_registered, @gst_filing_frequency, @tax_rate, @company_type, 1)`)
  for (const c of companies) insertCo.run(c)

  const insertSp = db.prepare(`INSERT OR IGNORE INTO business_spaces
    (name, area_sqm, is_exclusive_business, hours_per_week_business, total_hours_available, notes)
    VALUES (@name, @area_sqm, @is_exclusive_business, @hours_per_week_business, 168, @notes)`)
  for (const s of spaces) {
    if (!db.prepare('SELECT 1 FROM business_spaces WHERE name = ?').get(s.name)) insertSp.run(s)
  }

  const linkSp = db.prepare(`INSERT OR IGNORE INTO company_space_assignments (company_id, space_id) VALUES (?, ?)`)
  for (const [coName, spName] of assignments) {
    const co = db.prepare('SELECT id FROM companies WHERE name = ?').get(coName)
    const sp = db.prepare('SELECT id FROM business_spaces WHERE name = ?').get(spName)
    if (co && sp) linkSp.run(co.id, sp.id)
  }

  const insertRule = db.prepare(`INSERT OR IGNORE INTO categorisation_rules
    (match_pattern, suggested_category_id, suggested_business_use, confidence, kind, direct_company_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
  for (const r of rules) {
    if (db.prepare('SELECT 1 FROM categorisation_rules WHERE match_pattern = ?').get(r.pattern)) continue
    const catId = r.category ? db.prepare('SELECT id FROM expense_categories WHERE name = ?').get(r.category)?.id : null
    const dirId = r.directCompany ? db.prepare('SELECT id FROM companies WHERE name = ?').get(r.directCompany)?.id : null
    insertRule.run(r.pattern, catId || null, r.use, r.conf, r.kind, dirId || null, r.notes || null)
  }
}

// ─── Percentage calculator ───────────────────────────────────────────────────

export function calculateHomeUsePercentages() {
  const db = getDb()
  const house = db.prepare('SELECT total_floor_area_sqm FROM house_config WHERE id = 1').get()
  if (!house) return {}
  const totalArea = house.total_floor_area_sqm

  const spaces = db.prepare('SELECT * FROM business_spaces').all()
  const assignments = db.prepare('SELECT * FROM company_space_assignments').all()
  const companies = db.prepare('SELECT * FROM companies WHERE is_active = 1').all()

  // Count companies per space (for default split)
  const perSpace = {}
  for (const a of assignments) {
    perSpace[a.space_id] = (perSpace[a.space_id] || 0) + 1
  }

  const result = {}
  for (const co of companies) {
    let pct = 0
    const breakdown = []
    const coAssigns = assignments.filter(a => a.company_id === co.id)
    for (const a of coAssigns) {
      const sp = spaces.find(s => s.id === a.space_id)
      if (!sp) continue
      let basePct = sp.area_sqm / totalArea
      let spacePct = sp.is_exclusive_business
        ? basePct
        : basePct * ((sp.hours_per_week_business || 0) / (sp.total_hours_available || 168))
      const share = a.usage_share != null ? a.usage_share : (1 / perSpace[sp.id])
      const contribution = spacePct * share
      pct += contribution
      breakdown.push({ space: sp.name, base_pct: basePct, space_pct: spacePct, share, contribution })
    }
    result[co.id] = { company: co, percentage: pct, breakdown }
  }
  return result
}

export function validationWarnings() {
  const pcts = calculateHomeUsePercentages()
  const total = Object.values(pcts).reduce((s, x) => s + x.percentage, 0)
  const warnings = []
  if (total > 1.0)  warnings.push({ level: 'error', message: `Total allocation ${(total*100).toFixed(1)}% exceeds 100% — invalid.` })
  else if (total > 0.9) warnings.push({ level: 'warn', message: `Total allocation ${(total*100).toFixed(1)}% above 90% — IRD audit risk.` })
  return { total, warnings }
}

// ─── Allocation engine ───────────────────────────────────────────────────────

export function allocateExpense(homeExpenseId) {
  const db = getDb()
  const exp = db.prepare('SELECT * FROM home_expenses WHERE id = ?').get(homeExpenseId)
  if (!exp) throw new Error('home expense not found')
  const cat = exp.category_id ? db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(exp.category_id) : null

  const netCost = exp.total_amount_incl_gst - (exp.insurance_reimbursement || 0)
  let exGst, gstComponent
  if (exp.gst_included) {
    exGst = netCost / (1 + GST_RATE)
    gstComponent = netCost - exGst
  } else {
    exGst = netCost
    gstComponent = 0
  }

  const pcts = calculateHomeUsePercentages()

  // Wipe old allocations for this expense
  db.prepare('DELETE FROM expense_allocations WHERE home_expense_id = ?').run(homeExpenseId)

  const now = new Date().toISOString()
  const insert = db.prepare(`INSERT INTO expense_allocations
    (home_expense_id, company_id, home_use_percentage, allocated_amount_ex_gst, gst_claimable, income_tax_deduction, estimated_tax_saving, created_at, auto)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`)

  const allocations = []
  for (const { company, percentage } of Object.values(pcts)) {
    const allocEx = exGst * percentage
    const canClaimGst = company.gst_registered && (cat?.gst_claimable ?? 0)
    const gstClaim = canClaimGst ? gstComponent * percentage : 0
    const deduction = allocEx
    const taxSaving = deduction * company.tax_rate
    insert.run(homeExpenseId, company.id, percentage, allocEx, gstClaim, deduction, taxSaving, now)
    allocations.push({ company_id: company.id, company_name: company.name, percentage, allocated_amount_ex_gst: allocEx, gst_claimable: gstClaim, income_tax_deduction: deduction, estimated_tax_saving: taxSaving })
  }

  db.prepare(`INSERT INTO allocation_audit (home_expense_id, action, detail, created_at) VALUES (?, ?, ?, ?)`)
    .run(homeExpenseId, 'allocate', `auto allocation across ${allocations.length} companies`, now)

  return { home_expense_id: homeExpenseId, ex_gst: exGst, gst_component: gstComponent, net_cost: netCost, allocations }
}

// ─── Home expense CRUD ───────────────────────────────────────────────────────

export function createHomeExpense(input) {
  const db = getDb()
  const now = new Date().toISOString()
  const r = db.prepare(`INSERT INTO home_expenses
    (transaction_id, date, description, category_id, total_amount_incl_gst, gst_included, insurance_reimbursement, notes, created_at)
    VALUES (@transaction_id, @date, @description, @category_id, @total_amount_incl_gst, @gst_included, @insurance_reimbursement, @notes, @created_at)`).run({
    transaction_id: input.transaction_id || null,
    date: input.date,
    description: input.description || null,
    category_id: input.category_id || null,
    total_amount_incl_gst: input.total_amount_incl_gst,
    gst_included: input.gst_included ? 1 : 0,
    insurance_reimbursement: input.insurance_reimbursement || 0,
    notes: input.notes || null,
    created_at: now,
  })
  return r.lastInsertRowid
}

export function listHomeExpenses({ start, end, companyId, categoryId } = {}) {
  const db = getDb()
  let sql = `
    SELECT he.*, c.name as category_name, c.gst_claimable as category_gst_claimable
    FROM home_expenses he
    LEFT JOIN expense_categories c ON c.id = he.category_id
    WHERE 1=1`
  const params = []
  if (start) { sql += ' AND he.date >= ?'; params.push(start) }
  if (end)   { sql += ' AND he.date <= ?'; params.push(end) }
  if (categoryId) { sql += ' AND he.category_id = ?'; params.push(categoryId) }
  sql += ' ORDER BY he.date DESC, he.id DESC'
  const rows = db.prepare(sql).all(...params)

  const allocStmt = db.prepare(`SELECT a.*, c.name as company_name FROM expense_allocations a JOIN companies c ON c.id = a.company_id WHERE a.home_expense_id = ?`)
  return rows.map(r => {
    let allocations = allocStmt.all(r.id)
    if (companyId) allocations = allocations.filter(a => a.company_id === Number(companyId))
    return { ...r, allocations }
  })
}

export function deleteHomeExpense(id) {
  const db = getDb()
  db.prepare('DELETE FROM expense_allocations WHERE home_expense_id = ?').run(id)
  db.prepare('DELETE FROM home_expenses WHERE id = ?').run(id)
}

// ─── Phase 5: Leak repair worked example ─────────────────────────────────────

export function seedLeakExample() {
  const db = getDb()
  // Only insert once — detect by description
  const exists = db.prepare(`SELECT id FROM home_expenses WHERE description LIKE 'House leak repair%'`).get()
  if (exists) return exists.id
  const cat = db.prepare(`SELECT id FROM expense_categories WHERE name = 'Repairs & Maintenance'`).get()
  const id = createHomeExpense({
    transaction_id: null,
    date: new Date().toISOString().split('T')[0],
    description: 'House leak repair — gradual water damage',
    category_id: cat?.id || null,
    total_amount_incl_gst: 14000,
    gst_included: true,
    insurance_reimbursement: 1500,
    notes: 'Gradual leak, insurance covered only $1,500 of $14,000 total',
  })
  allocateExpense(id)
  return id
}

// ─── Phase 3: Auto-tagging ───────────────────────────────────────────────────

export function autoTagTransactions() {
  const db = getDb()
  const rules = db.prepare('SELECT * FROM categorisation_rules').all()
  const rows = db.prepare(`SELECT _id, description, merchant_name FROM transactions WHERE reviewed = 0`).all()

  const upd = db.prepare(`UPDATE transactions SET
    is_home_expense = ?,
    is_direct_business_expense = ?,
    assigned_company_id = ?,
    category_override_id = ?,
    reviewed = ?,
    reviewed_at = ?
   WHERE _id = ?`)
  const now = new Date().toISOString()

  let tagged = 0
  const trans = db.transaction(() => {
    for (const tx of rows) {
      const text = `${tx.description || ''} ${tx.merchant_name || ''}`.toLowerCase()
      const hit = rules.find(r => new RegExp(r.match_pattern, 'i').test(text))
      if (!hit) continue
      const auto = hit.confidence === 'auto'
      if (hit.kind === 'home') {
        upd.run(1, 0, null, hit.suggested_category_id || null, auto ? 1 : 0, auto ? now : null, tx._id)
      } else if (hit.kind === 'direct') {
        upd.run(0, 1, hit.direct_company_id || null, hit.suggested_category_id || null, auto ? 1 : 0, auto ? now : null, tx._id)
      } else if (hit.kind === 'income') {
        upd.run(0, 0, hit.direct_company_id || null, null, auto ? 1 : 0, auto ? now : null, tx._id)
      } else if (hit.kind === 'personal') {
        upd.run(0, 0, null, null, auto ? 1 : 0, auto ? now : null, tx._id)
      }
      tagged++
    }
  })
  trans()
  return { tagged, totalRules: rules.length }
}

export function getReviewQueue() {
  const db = getDb()
  return db.prepare(`
    SELECT _id, date, description, merchant_name, amount, is_home_expense, is_direct_business_expense, assigned_company_id, category_override_id
    FROM transactions
    WHERE reviewed = 0
      AND _internal = 0
      AND (is_home_expense = 1 OR is_direct_business_expense = 1 OR assigned_company_id IS NOT NULL)
    ORDER BY date DESC
    LIMIT 200
  `).all()
}

export function markReviewed(_id) {
  getDb().prepare('UPDATE transactions SET reviewed = 1, reviewed_at = ? WHERE _id = ?').run(new Date().toISOString(), _id)
}

// ─── Phase 4: Dashboard summary ──────────────────────────────────────────────

export function getCompanyDashboard({ start, end } = {}) {
  const db = getDb()
  const pcts = calculateHomeUsePercentages()
  const companies = db.prepare('SELECT * FROM companies WHERE is_active = 1').all()

  let allocSql = `SELECT a.*, he.date FROM expense_allocations a JOIN home_expenses he ON he.id = a.home_expense_id WHERE 1=1`
  const params = []
  if (start) { allocSql += ' AND he.date >= ?'; params.push(start) }
  if (end)   { allocSql += ' AND he.date <= ?'; params.push(end) }
  const allocs = db.prepare(allocSql).all(...params)

  return companies.map(co => {
    const myAllocs = allocs.filter(a => a.company_id === co.id)
    const deductions = myAllocs.reduce((s, a) => s + a.income_tax_deduction, 0)
    const gst = myAllocs.reduce((s, a) => s + a.gst_claimable, 0)
    const taxSaving = myAllocs.reduce((s, a) => s + a.estimated_tax_saving, 0)
    return {
      ...co,
      home_use_percentage: pcts[co.id]?.percentage || 0,
      ytd_deductions: deductions,
      ytd_gst_reclaimed: gst,
      estimated_tax_saving: taxSaving,
      allocation_count: myAllocs.length,
    }
  })
}

// ─── Phase 4.2: GST helper ───────────────────────────────────────────────────

export function getGstSummary(companyId, { start, end }) {
  const db = getDb()
  const co = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId)
  if (!co) throw new Error('company not found')

  // Income from tagged transactions assigned to this company (positive amounts)
  const txSql = `SELECT amount FROM transactions WHERE assigned_company_id = ? AND date >= ? AND date <= ?`
  const txs = db.prepare(txSql).all(companyId, start, end)
  const sales = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const directExpenses = txs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)

  const gstFrac = co.gst_registered ? GST_RATE / (1 + GST_RATE) : 0
  const gstCollected = sales * gstFrac
  const gstOnDirect = directExpenses * gstFrac

  // Home office GST credits for this company within the period
  const homeGst = db.prepare(`
    SELECT COALESCE(SUM(a.gst_claimable), 0) as gst, COALESCE(SUM(a.allocated_amount_ex_gst), 0) as net
    FROM expense_allocations a JOIN home_expenses he ON he.id = a.home_expense_id
    WHERE a.company_id = ? AND he.date >= ? AND he.date <= ?`).get(companyId, start, end)

  const totalCredits = gstOnDirect + (homeGst?.gst || 0)
  const gstToPay = gstCollected - totalCredits
  const ratio = gstCollected > 0 ? totalCredits / gstCollected : null

  return {
    company: co,
    period: { start, end },
    sales_incl_gst: sales,
    gst_collected: gstCollected,
    direct_expenses_incl_gst: directExpenses,
    gst_on_direct: gstOnDirect,
    home_office_gst_credit: homeGst?.gst || 0,
    total_credits: totalCredits,
    gst_to_pay: gstToPay,
    credit_to_collection_ratio: ratio,
    ratio_warning: ratio !== null && ratio < 0.10,
  }
}

// ─── Phase 4.3: Income tax summary ───────────────────────────────────────────

export function getIncomeTaxSummary(companyId, { start, end }) {
  const db = getDb()
  const co = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId)
  if (!co) throw new Error('company not found')

  const txs = db.prepare(`SELECT amount FROM transactions WHERE assigned_company_id = ? AND date >= ? AND date <= ?`).all(companyId, start, end)
  const grossIncl = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const directIncl = txs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)

  const gstFrac = co.gst_registered ? GST_RATE / (1 + GST_RATE) : 0
  const grossEx  = grossIncl  * (1 - gstFrac)
  const directEx = directIncl * (1 - gstFrac)

  const homeDeduct = db.prepare(`
    SELECT COALESCE(SUM(a.income_tax_deduction), 0) as d
    FROM expense_allocations a JOIN home_expenses he ON he.id = a.home_expense_id
    WHERE a.company_id = ? AND he.date >= ? AND he.date <= ?`).get(companyId, start, end)?.d || 0

  const netProfit = grossEx - directEx - homeDeduct
  const taxPayable = Math.max(0, netProfit * co.tax_rate)
  return {
    company: co,
    period: { start, end },
    gross_income_ex_gst: grossEx,
    direct_business_expenses_ex_gst: directEx,
    home_office_deductions: homeDeduct,
    net_taxable_profit: netProfit,
    tax_rate: co.tax_rate,
    tax_payable: taxPayable,
  }
}

// ─── Phase 7: CSV / Accountant pack export ───────────────────────────────────

export function exportAllocationsCsv({ start, end } = {}) {
  const items = listHomeExpenses({ start, end })
  const header = 'expense_id,date,description,category,total_incl_gst,gst_included,insurance_reimbursement,company,home_use_pct,allocated_ex_gst,gst_claimable,deduction,tax_saving'
  const rows = []
  for (const e of items) {
    for (const a of e.allocations) {
      rows.push([
        e.id, e.date,
        JSON.stringify(e.description || ''),
        JSON.stringify(e.category_name || ''),
        e.total_amount_incl_gst,
        e.gst_included ? 'Y' : 'N',
        e.insurance_reimbursement,
        JSON.stringify(a.company_name),
        (a.home_use_percentage * 100).toFixed(4),
        a.allocated_amount_ex_gst.toFixed(2),
        a.gst_claimable.toFixed(2),
        a.income_tax_deduction.toFixed(2),
        a.estimated_tax_saving.toFixed(2),
      ].join(','))
    }
  }
  return [header, ...rows].join('\n')
}

export function getGstReturnFormatted(companyId, { start, end }) {
  const s = getGstSummary(companyId, { start, end })
  return {
    company: s.company.name,
    period: s.period,
    GST101A: {
      box5_total_sales: s.sales_incl_gst.toFixed(2),
      box6_zero_rated: '0.00',
      box9_total_sales_subject_to_gst: s.sales_incl_gst.toFixed(2),
      box11_gst_collected: s.gst_collected.toFixed(2),
      box13_total_purchases_subject_to_gst: (s.direct_expenses_incl_gst + s.home_office_gst_credit / (GST_RATE / (1 + GST_RATE) || 1)).toFixed(2),
      box14_gst_on_purchases: s.total_credits.toFixed(2),
    },
    gst_to_pay: s.gst_to_pay.toFixed(2),
  }
}

export function getAccountantPack({ start, end }) {
  return {
    period: { start, end },
    house_config: getDb().prepare('SELECT * FROM house_config WHERE id = 1').get(),
    spaces: getDb().prepare('SELECT * FROM business_spaces').all(),
    companies: getDb().prepare('SELECT * FROM companies').all(),
    home_use_percentages: calculateHomeUsePercentages(),
    home_expenses: listHomeExpenses({ start, end }),
    company_dashboard: getCompanyDashboard({ start, end }),
  }
}

// ─── Phase 7.2: IRD checklist ────────────────────────────────────────────────

export function getFilingChecklist(companyId, { start, end }) {
  const db = getDb()
  const co = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId)
  const txCount = db.prepare(`SELECT COUNT(*) as c FROM transactions WHERE assigned_company_id = ? AND date >= ? AND date <= ?`).get(companyId, start, end).c
  const reviewedCount = db.prepare(`SELECT COUNT(*) as c FROM transactions WHERE assigned_company_id = ? AND date >= ? AND date <= ? AND reviewed = 1`).get(companyId, start, end).c
  const allocCount = db.prepare(`SELECT COUNT(*) as c FROM expense_allocations a JOIN home_expenses he ON he.id = a.home_expense_id WHERE a.company_id = ? AND he.date >= ? AND he.date <= ?`).get(companyId, start, end).c
  return {
    company: co?.name,
    period: { start, end },
    items: [
      { label: 'All transactions reviewed and categorised', done: txCount > 0 && reviewedCount === txCount, detail: `${reviewedCount}/${txCount}` },
      { label: 'Home expenses allocated', done: allocCount > 0, detail: `${allocCount} allocations` },
      { label: 'GST return calculated (if GST-registered)', done: !co?.gst_registered ? true : null },
      { label: 'Income tax return prepared (annual)', done: null },
      { label: 'Exported for accountant review', done: null },
      { label: 'Filed with IRD', done: null },
    ],
  }
}

// ─── Companies / spaces / config CRUD (for settings UI) ──────────────────────

export function listCompanies() { return getDb().prepare('SELECT * FROM companies ORDER BY id').all() }
export function listSpaces()    { return getDb().prepare('SELECT * FROM business_spaces ORDER BY id').all() }
export function listAssignments() { return getDb().prepare('SELECT * FROM company_space_assignments').all() }
export function listCategories(){ return getDb().prepare('SELECT * FROM expense_categories ORDER BY name').all() }
export function listRules()     { return getDb().prepare('SELECT * FROM categorisation_rules ORDER BY id').all() }
export function getHouseConfig(){ return getDb().prepare('SELECT * FROM house_config WHERE id = 1').get() }

export function updateHouseConfig({ total_floor_area_sqm, address }) {
  const db = getDb()
  const now = new Date().toISOString()
  if (db.prepare('SELECT 1 FROM house_config WHERE id = 1').get()) {
    db.prepare('UPDATE house_config SET total_floor_area_sqm = ?, address = ?, updated_at = ? WHERE id = 1')
      .run(total_floor_area_sqm, address || null, now)
  } else {
    db.prepare('INSERT INTO house_config (id, total_floor_area_sqm, address, updated_at) VALUES (1, ?, ?, ?)')
      .run(total_floor_area_sqm, address || null, now)
  }
  return getHouseConfig()
}

export function updateSpace(id, patch) {
  const db = getDb()
  const cur = db.prepare('SELECT * FROM business_spaces WHERE id = ?').get(id)
  if (!cur) throw new Error('space not found')
  const next = { ...cur, ...patch }
  db.prepare(`UPDATE business_spaces SET name=?, area_sqm=?, is_exclusive_business=?, hours_per_week_business=?, total_hours_available=?, notes=? WHERE id=?`)
    .run(next.name, next.area_sqm, next.is_exclusive_business ? 1 : 0, next.hours_per_week_business || null, next.total_hours_available || 168, next.notes || null, id)
  return db.prepare('SELECT * FROM business_spaces WHERE id = ?').get(id)
}

// ─── Akahu account mapping (Phase 6) ─────────────────────────────────────────

export function listAkahuAccounts() { return getDb().prepare('SELECT * FROM akahu_accounts').all() }

export function setAkahuAccountCompany(akahuAccountId, companyId, accountName, bankName) {
  const db = getDb()
  const existing = db.prepare('SELECT id FROM akahu_accounts WHERE akahu_account_id = ?').get(akahuAccountId)
  if (existing) {
    db.prepare('UPDATE akahu_accounts SET company_id = ?, account_name = ?, bank_name = ? WHERE id = ?')
      .run(companyId || null, accountName || null, bankName || null, existing.id)
  } else {
    db.prepare('INSERT INTO akahu_accounts (akahu_account_id, company_id, account_name, bank_name) VALUES (?, ?, ?, ?)')
      .run(akahuAccountId, companyId || null, accountName || null, bankName || null)
  }
  // Cascade: assign company to all matching transactions
  if (companyId) {
    db.prepare(`UPDATE transactions SET assigned_company_id = ? WHERE account_id = ? AND assigned_company_id IS NULL`).run(companyId, akahuAccountId)
  }
  return db.prepare('SELECT * FROM akahu_accounts WHERE akahu_account_id = ?').get(akahuAccountId)
}
