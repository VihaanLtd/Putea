import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, 'putea.db')

let db

export function getDb() {
  if (db) return db
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      _id           TEXT PRIMARY KEY,
      account_id    TEXT,
      date          TEXT NOT NULL,
      description   TEXT,
      amount        REAL NOT NULL,
      type          TEXT,
      merchant_name TEXT,
      category_name TEXT,
      _internal     INTEGER NOT NULL DEFAULT 0,
      raw           TEXT NOT NULL,
      synced_at     TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tx_date    ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id);

    CREATE TABLE IF NOT EXISTS sync_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS account_names (
      account_id TEXT PRIMARY KEY,
      custom_name TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)

  // Migrate: add new columns if not present
  const cols = db.prepare('PRAGMA table_info(transactions)').all().map(c => c.name)
  if (!cols.includes('ai_category'))        db.exec('ALTER TABLE transactions ADD COLUMN ai_category TEXT')
  if (!cols.includes('ai_categorised'))     db.exec('ALTER TABLE transactions ADD COLUMN ai_categorised INTEGER NOT NULL DEFAULT 0')
  if (!cols.includes('manual_category'))    db.exec('ALTER TABLE transactions ADD COLUMN manual_category TEXT')
  if (!cols.includes('manually_categorised')) db.exec('ALTER TABLE transactions ADD COLUMN manually_categorised INTEGER NOT NULL DEFAULT 0')

  return db
}

export function getLastSyncDate() {
  const row = getDb().prepare('SELECT value FROM sync_state WHERE key = ?').get('last_sync_date')
  return row?.value || null
}

export function setLastSyncDate(date) {
  getDb().prepare('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)').run('last_sync_date', date)
}

export function getCustomAccountName(accountId) {
  const row = getDb().prepare('SELECT custom_name FROM account_names WHERE account_id = ?').get(accountId)
  return row?.custom_name || null
}

export function setCustomAccountName(accountId, customName) {
  const now = new Date().toISOString()
  getDb().prepare('INSERT OR REPLACE INTO account_names (account_id, custom_name, updated_at) VALUES (?, ?, ?)').run(accountId, customName, now)
  return { accountId, customName, updated_at: now }
}

export function getAllCustomAccountNames() {
  return getDb().prepare('SELECT account_id, custom_name FROM account_names').all()
}

export function insertTransactions(taggedTxs) {
  const db = getDb()
  const now = new Date().toISOString()
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO transactions
      (_id, account_id, date, description, amount, type, merchant_name, category_name, _internal, raw, synced_at)
    VALUES
      (@_id, @account_id, @date, @description, @amount, @type, @merchant_name, @category_name, @_internal, @raw, @synced_at)
  `)
  let inserted = 0
  const run = db.transaction(txs => {
    for (const tx of txs) {
      const r = stmt.run({
        _id:           tx._id,
        account_id:    tx._account || null,
        date:          tx.date,
        description:   tx.description || null,
        amount:        tx.amount,
        type:          tx.type || null,
        merchant_name: tx.merchant?.name || null,
        category_name: tx.category?.groups?.personal_finance?.name || tx.category?.name || null,
        _internal:     tx._internal ? 1 : 0,
        raw:           JSON.stringify(tx),
        synced_at:     now,
      })
      if (r.changes > 0) inserted++
    }
  })
  run(taggedTxs)
  return inserted
}

export function queryTransactions({ start, end } = {}) {
  let sql = 'SELECT raw, _internal, ai_category, ai_categorised, manual_category, manually_categorised FROM transactions WHERE 1=1'
  const params = []
  if (start) { sql += ' AND date >= ?'; params.push(start) }
  if (end)   { sql += ' AND date <= ?'; params.push(end) }
  sql += ' ORDER BY date DESC, rowid DESC'
  return getDb().prepare(sql).all(...params).map(row => ({
    ...JSON.parse(row.raw),
    _internal:            row._internal === 1,
    ai_category:          row.ai_category || null,
    ai_categorised:       row.ai_categorised === 1,
    manual_category:      row.manual_category || null,
    manually_categorised: row.manually_categorised === 1,
  }))
}

export function updateManualCategory(_id, category) {
  const db = getDb()
  const tx = db.prepare('SELECT description FROM transactions WHERE _id = ?').get(_id)
  if (!tx) return { updated: 0, description: null }

  // Update every transaction with the same description (overrides Akahu category too)
  const result = db.prepare(`
    UPDATE transactions
    SET manual_category = ?, manually_categorised = 1
    WHERE description = ?
  `).run(category, tx.description)

  return { updated: result.changes, description: tx.description }
}

// Standard categories always available in dropdowns (merged with DB values)
export const STANDARD_CATEGORIES = [
  'Business Services',
  'Charity',
  'Childcare',
  'Education',
  'Entertainment',
  'Food & Drink',
  'Government & Taxes',
  'Gym & Fitness',
  'Health & Medical',
  'Income',
  'Insurance',
  'Internet & Phone',
  'Investments',
  'Loan',
  'Medical Fees',
  'Other',
  'Personal Care',
  'Personal Transfer',
  'Pharmacy',
  'Power & Gas',
  'Rent & Mortgage',
  'Shopping',
  'Transport and Fuel',
  'Travel & Accommodation',
  'Utilities',
]

export function getAllCategories() {
  const rows = getDb().prepare(`
    SELECT DISTINCT category_name as cat FROM transactions WHERE category_name IS NOT NULL AND category_name != ''
    UNION
    SELECT DISTINCT ai_category FROM transactions WHERE ai_category IS NOT NULL AND ai_category != ''
    UNION
    SELECT DISTINCT manual_category FROM transactions WHERE manual_category IS NOT NULL AND manual_category != ''
    ORDER BY cat
  `).all()
  const fromDb = rows.map(r => r.cat).filter(Boolean)
  return [...new Set([...STANDARD_CATEGORIES, ...fromDb])].sort()
}

// Normalise AI/manual categories — run once on startup to apply renames/merges
// Never touches category_name (Akahu source data)
export function normaliseCategories() {
  const db = getDb()
  const migrations = [
    // Merge sub-food categories into Food & Drink
    [`UPDATE transactions SET ai_category = 'Food & Drink' WHERE ai_category IN ('Groceries', 'Coffee', 'Food')`, null],
    [`UPDATE transactions SET manual_category = 'Food & Drink' WHERE manual_category IN ('Groceries', 'Coffee', 'Food')`, null],
    // Merge sub-transport into Transport and Fuel
    [`UPDATE transactions SET ai_category = 'Transport and Fuel' WHERE ai_category IN ('Transport', 'Parking', 'Public Transport', 'Petrol')`, null],
    [`UPDATE transactions SET manual_category = 'Transport and Fuel' WHERE manual_category IN ('Transport', 'Parking', 'Public Transport', 'Petrol')`, null],
    // Remove Appearance — reset to uncategorised so AI/user can re-classify
    [`UPDATE transactions SET ai_category = NULL, ai_categorised = 0 WHERE ai_category = 'Appearance'`, null],
    [`UPDATE transactions SET manual_category = NULL, manually_categorised = 0 WHERE manual_category = 'Appearance'`, null],
  ]
  let total = 0
  db.transaction(() => {
    for (const [sql] of migrations) {
      total += db.prepare(sql).run().changes
    }
  })()
  if (total > 0) console.log(`[db] normalised ${total} category values`)
  return total
}

// Returns uncategorised expense transactions (no Akahu category, not internal, expense)
export function getUncategorised() {
  return getDb().prepare(`
    SELECT _id, description, merchant_name, amount, date
    FROM transactions
    WHERE (category_name IS NULL OR category_name = '')
      AND (ai_category IS NULL OR ai_category = '')
      AND manually_categorised = 0
      AND _internal = 0
      AND amount < 0
    ORDER BY date DESC
  `).all()
}

// Bulk-save AI category results: [{_id, category}]
export function saveAiCategories(results) {
  const db = getDb()
  const stmt = db.prepare(`
    UPDATE transactions SET ai_category = @category, ai_categorised = 1 WHERE _id = @_id
  `)
  const run = db.transaction(rows => {
    for (const r of rows) stmt.run(r)
  })
  run(results)
}

// Aggregate spending by category for a date range (reads from DB columns, not raw JSON)
export function getCategorySpending({ start, end } = {}) {
  let sql = `
    SELECT
      COALESCE(
        NULLIF(manual_category, ''),
        NULLIF(category_name, ''),
        NULLIF(ai_category, ''),
        'Uncategorised'
      ) AS category,
      SUM(ABS(amount)) AS amount,
      COUNT(*) AS count
    FROM transactions
    WHERE amount < 0 AND _internal = 0
  `
  const params = []
  if (start) { sql += ' AND date >= ?'; params.push(start) }
  if (end)   { sql += ' AND date <= ?'; params.push(end) }
  sql += ' GROUP BY category ORDER BY amount DESC'
  return getDb().prepare(sql).all(...params)
}

export function dbStats() {
  const db = getDb()
  const { count }    = db.prepare('SELECT COUNT(*) as count FROM transactions').get()
  const { aiCount }  = db.prepare('SELECT COUNT(*) as aiCount FROM transactions WHERE ai_categorised = 1').get()
  const { uncat }    = db.prepare(`
    SELECT COUNT(*) as uncat FROM transactions
    WHERE (category_name IS NULL OR category_name = '')
      AND (ai_category IS NULL OR ai_category = '')
      AND _internal = 0 AND amount < 0
  `).get()
  const oldest = db.prepare('SELECT MIN(date) as d FROM transactions').get()?.d
  const newest = db.prepare('SELECT MAX(date) as d FROM transactions').get()?.d
  const last   = getLastSyncDate()
  return { totalTransactions: count, aiCategorised: aiCount, uncategorised: uncat, oldest, newest, lastSync: last }
}
