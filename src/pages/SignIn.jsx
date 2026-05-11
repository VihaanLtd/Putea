import { SignIn } from '@clerk/clerk-react'

export default function SignInPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 32,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 36,
          color: 'var(--accent)',
          letterSpacing: -1,
          marginBottom: 6,
        }}>
          Pūtea
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' }}>
          NZ · Personal Finance Dashboard
        </div>
      </div>

      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl={false}
        appearance={{
          variables: {
            colorPrimary:      '#34d399',
            colorBackground:   '#1f2937',
            colorInputBackground: '#2d3748',
            colorInputText:    '#f9fafb',
            colorText:         '#f9fafb',
            colorTextSecondary:'#9ca3af',
            colorNeutral:      '#9ca3af',
            borderRadius:      '10px',
            fontFamily:        'DM Sans, system-ui, sans-serif',
          },
          elements: {
            card: {
              background: '#1f2937',
              border: '1px solid #374151',
              boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
            },
            headerTitle:    { color: '#f9fafb' },
            headerSubtitle: { color: '#9ca3af' },
            formButtonPrimary: {
              background: '#34d399',
              color: '#0a1a12',
              fontWeight: 600,
            },
            footerActionLink: { color: '#34d399' },
          },
        }}
      />
    </div>
  )
}
