# Deploying FinWell NZ to Vercel

## Option A: Vercel Serverless Functions (recommended)

Vercel can't run a long-running Express server, so the API routes need to
be converted to individual serverless functions.

### File layout for Vercel

```
api/
  accounts.js       ← GET /api/accounts
  summary.js        ← GET /api/summary
  transactions.js   ← GET /api/transactions
  ask.js            ← POST /api/ask
src/                ← React frontend (unchanged)
vite.config.js
```

### Example: api/accounts.js

```js
import { akahuGet } from './_akahu.js'

export default async function handler(req, res) {
  try {
    const data = await akahuGet('/accounts')
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
```

### Shared helper: api/_akahu.js

```js
export async function akahuGet(path, params = {}) {
  const url = new URL(`https://api.akahu.io/v1${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${process.env.AKAHU_USER_TOKEN}`,
      'X-Akahu-ID': process.env.AKAHU_APP_TOKEN,
    },
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.message)
  return json
}
```

### vercel.json

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

## Option B: Run on your Hostinger VPS (simpler)

Since you already have Nginx + PM2 running on your VPS:

1. Clone the repo on the VPS
2. `npm install && npm run build`
3. Run the API: `pm2 start api/server.js --name finwell-api`
4. Serve the built frontend via Nginx:

```nginx
server {
  listen 80;
  server_name finwell.yourdomain.com;

  root /var/www/finwell-nz/dist;
  index index.html;

  location /api/ {
    proxy_pass http://localhost:3001/api/;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

5. Add Cloudflare Access for authentication (so only you can access it)

## Environment Variables

Set these in Vercel dashboard → Project Settings → Environment Variables:

| Variable | Value |
|---|---|
| `AKAHU_APP_TOKEN` | From my.akahu.nz/developers |
| `AKAHU_USER_TOKEN` | From my.akahu.nz/developers |
| `ANTHROPIC_API_KEY` | From console.anthropic.com |
