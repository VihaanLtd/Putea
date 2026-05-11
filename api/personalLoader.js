// Loads api/personal.js if present (gitignored, real data), otherwise falls
// back to api/personal.example.js. Lets the app boot on a fresh clone of the
// public repo with safe placeholder data.
import fs from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const personalPath = join(__dirname, 'personal.js')

let personal
if (fs.existsSync(personalPath)) {
  personal = (await import('./personal.js')).default
  console.log('[personal] using api/personal.js (local overrides)')
} else {
  personal = (await import('./personal.example.js')).default
  console.log('[personal] api/personal.js not found — using example template. Copy api/personal.example.js to api/personal.js and edit it for your deployment.')
}

export default personal
