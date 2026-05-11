# Pūtea

Personal financial dashboard for New Zealand — powered by **Akahu** (NZ open banking) and **Claude AI**.

## What it does

- **Dashboard** — Real-time net worth, 30-day cash flow, savings rate, spending by category, portfolio overview
- **Accounts** — All connected NZ bank accounts, mortgages, investments grouped by type with **custom naming** for business accounts
- **Transactions** — Full searchable/filterable feed with merchant names, NZFCC categories, manual overrides, and account filtering
- **GST Return** — IRD GST101A form builder with NZ tax year calendar, category-based claim rates (Food/Drink 50%, Transport 75%, etc), live calculations, due date tracking
- **Tax Planning** — **Visual interactive calendar** with horizontal scroll, period selection across tax years, current/past/future indicators
- **AI Advisor** — Ask Claude questions grounded in your real financial data and financial metrics

## Key Features

### 🗓️ NZ Tax Year Navigation
- **Interactive horizontal-scroll calendar** showing all periods in one row
- **Smart period selection** for Monthly, 2-Monthly (NZ GST standard), and 6-Monthly frequencies
- **Visual indicators**: "Now" (current period), "Selected" (highlighted), "Past" (dimmed)
- Fiscal year labels (FY 2024–25, FY 2025–26, etc.) with 📅 emoji
- Smooth animations and hover effects

### 💼 Custom Account Naming
- **Rename any account** with custom names (e.g., "Operating", "Project X Business")
- **Click to edit** inline with Save/Cancel buttons
- **Persistent storage** in SQLite database—survives bank API updates
- **"custom" badge** shows when a name has been customized
- Perfect for business accounts that come with generic names from ANZ, ASB, etc.

### 📊 GST Return (IRD GST101A)
- **Box-by-box breakdown**: Sales (Box 5), Zero-rated (Box 6), Purchases (Box 11), GST credits
- **Category-based claim rates**: Food & Drink 50%, Entertainment 50%, Transport 75%, Internet 75%, Exempt 0%
- **Transaction detail**: Expandable rows showing each transaction, merchant, account, and claimable GST
- **Live calculations**: Net GST (refund/payable), filing due dates with IRD concession for 31 Mar end
- **Pre-filing checklist**: Wages, interest, rent, exports, private use, late fees

### 🏦 Smart Account Management
- **All NZ banks supported**: ANZ, ASB, BNZ, Westpac, Kiwibank, Sharesies, InvestNow, etc.
- **Live balance updates** from Akahu open banking API
- **Account grouping**: Checking, Savings, Investments, Mortgages, Credit Cards
- **Account type badges** with color coding and total aggregation
- **Formatted account numbers** and holder names (when available)

### 💬 AI Financial Advisor
- **Ask Claude anything** about your money—spending patterns, cash flow, savings rate
- **Context-aware**: Real transaction data, actual account balances, net worth
- **Personalized advice** for NZ tax, rental income, investment strategies
- **Concise 3–5 sentence responses** or detailed breakdowns on demand

### 🔐 Privacy & Security
- **No data stored on servers** — all processing is real-time from Akahu
- **Clerk authentication** with email allowlist (optional)
- **Local SQLite database** for categories and sync state only
- **24-hour API caching** to minimize Akahu calls

## Environment Configuration

### Port Configuration (May 2026+)
- **Configurable API port** via `API_PORT` or `PORT` environment variables
- Default: `3001` for API, `5173` for Vite client
- **Smart error handling**: Clear message if port is already in use
- **Vite proxy auto-update**: Frontend proxy automatically uses configured API port

```bash
# Use custom API port
API_PORT=3002 npm run dev

# Or set PORT env var
PORT=3002 npm run dev
```

## Supported institutions (via Akahu)

ANZ · ASB · BNZ · Westpac · Kiwibank · Sharesies · InvestNow · and many more

## Quick start

```bash
git clone https://github.com/VihaanLtd/P-tea
cd P-tea
npm install
cp .env.example .env.local
# fill in .env.local with your Akahu + Anthropic keys
npm run dev
```

Open http://localhost:5173

## Tech stack

- **Frontend**: React + Vite + Recharts + custom components
- **Backend**: Node.js / Express (or Vercel serverless functions)
- **Database**: SQLite (better-sqlite3) for local state, sync tracking, custom account names
- **Data**: Akahu NZ Open Banking API
- **AI**: Anthropic Claude (Sonnet model for financial analysis)
- **Authentication**: Clerk (optional, with email allowlist)
- **Deploy**: Vercel or Hostinger VPS + Nginx + PM2

## Recent Enhancements (2026)

✅ **Port Configuration** — Flexible API port via environment variables  
✅ **Tax Year Calendar** — Visual interactive calendar for period selection  
✅ **Custom Account Names** — Rename business accounts locally  
✅ **GST Return Form** — Full IRD GST101A support with category-based rates  
✅ **Transaction Categorization** — AI + manual overrides with Akahu rules  

## License: MIT

