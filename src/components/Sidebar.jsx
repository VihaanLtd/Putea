import { NavLink } from 'react-router-dom'
import { UserButton, useUser } from '@clerk/clerk-react'

const NAV = [
  { to: '/',             icon: '◈', label: 'Overview' },
  { to: '/transactions', icon: '⇄', label: 'Transactions' },
  { to: '/tax',          icon: '✦', label: 'GST & Tax' },
  { to: '/home-office',  icon: '⌂', label: 'Home Office' },
  { to: '/ask',          icon: '◎', label: 'AI Advisor' },

]

export default function Sidebar() {
  const { user } = useUser()

  return (
    <nav className="sidebar">
      <div className="logo">
        <div className="logo-title">Pūtea</div>
        <div className="logo-sub">NZ · Personal Finance</div>
      </div>

      {NAV.map(n => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.to === '/'}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <span className="nav-icon">{n.icon}</span>
          {n.label}
        </NavLink>
      ))}

      {/* User profile at bottom */}
      <div style={{ marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <UserButton
            appearance={{
              elements: {
                avatarBox: { width: 32, height: 32 },
              },
            }}
          />
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.firstName || user?.emailAddresses?.[0]?.emailAddress?.split('@')[0]}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.emailAddresses?.[0]?.emailAddress}
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}
