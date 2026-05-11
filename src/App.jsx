import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { SignedIn, SignedOut, RedirectToSignIn, useUser, useClerk } from '@clerk/clerk-react'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Ask from './pages/Ask'
import Tax from './pages/Tax'
import HomeOffice from './pages/HomeOffice'
import SignInPage from './pages/SignIn'

// Comma-separated list in .env.local — e.g. VITE_ALLOWED_EMAILS=you@x.com,other@y.com
// Empty means: skip the frontend check and trust the backend (which has its own allowlist).
const ALLOWED_EMAILS = (import.meta.env.VITE_ALLOWED_EMAILS || '')
  .split(',').map(s => s.trim()).filter(Boolean)

function AuthorizedApp() {
  const { user } = useUser()
  const { signOut } = useClerk()
  const email = user?.primaryEmailAddress?.emailAddress

  if (ALLOWED_EMAILS.length > 0 && !ALLOWED_EMAILS.includes(email)) {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 20, padding: 24, textAlign: 'center',
      }}>
        <div style={{ fontSize: 36 }}>🔒</div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24, color: 'var(--text)', letterSpacing: -0.5 }}>
          Access Restricted
        </div>
        <div style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 360, lineHeight: 1.6 }}>
          This is a private finance dashboard. The account <strong style={{ color: 'var(--text)' }}>{email}</strong> does not have permission to access this application.
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          If you believe this is a mistake, please contact the account owner.
        </div>
        <button
          className="btn btn-primary"
          style={{ marginTop: 8, padding: '10px 28px' }}
          onClick={() => signOut({ redirectUrl: '/sign-in' })}
        >
          Sign out
        </button>
      </div>
    )
  }

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <Routes>
          <Route path="/"             element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/tax"          element={<Tax />} />
          <Route path="/home-office"  element={<HomeOffice />} />
          <Route path="/ask"          element={<Ask />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route
          path="/*"
          element={
            <>
              <SignedIn><AuthorizedApp /></SignedIn>
              <SignedOut><RedirectToSignIn /></SignedOut>
            </>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
