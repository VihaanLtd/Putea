import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CACHE_FILE = path.join(__dirname, '.cache.json')

export const TTL_24H  = 24 * 60 * 60 * 1000
export const TTL_30D  = 30 * 24 * 60 * 60 * 1000

function load() {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) }
  catch { return {} }
}

function save(store) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(store))
}

export function getCached(key, defaultTtl = TTL_24H) {
  const store = load()
  const entry = store[key]
  if (!entry) return null
  const ttl = entry.ttl ?? defaultTtl
  if (Date.now() - entry.ts > ttl) return null
  return entry.data
}

export function setCached(key, data, ttl = TTL_24H) {
  const store = load()
  store[key] = { ts: Date.now(), ttl, data }
  save(store)
}

export function cacheStatus() {
  const store = load()
  return Object.entries(store).map(([key, e]) => ({
    endpoint: key,
    cachedAt: new Date(e.ts).toISOString(),
    ageMinutes: Math.round((Date.now() - e.ts) / 60000),
    ttlHours: Math.round((e.ttl ?? TTL_24H) / 3600000),
    fresh: Date.now() - e.ts < (e.ttl ?? TTL_24H),
    expiresAt: new Date(e.ts + (e.ttl ?? TTL_24H)).toISOString(),
  }))
}

export function clearCache() {
  save({})
}

export function deleteCacheKey(key) {
  const store = load()
  delete store[key]
  save(store)
}
