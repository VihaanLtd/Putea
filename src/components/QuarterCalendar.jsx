import { useMemo } from 'react'

/**
 * Visual calendar showing NZ tax year (April–March) with period highlights.
 * Shows current date indicator and allows visual navigation.
 */
export default function QuarterCalendar({ freqM, offset, onOffsetChange }) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  
  // Determine tax year (April = start)
  const TAX_START = 3
  const taxYear = currentMonth >= TAX_START ? currentYear : currentYear - 1
  
  // Compute periods for this tax year and adjacent years for context
  const periods = useMemo(() => {
    const list = []
    const periodsPerYear = 12 / freqM
    
    // Include previous and next tax years for context
    for (let ty = taxYear - 1; ty <= taxYear + 1; ty++) {
      for (let p = 0; p < periodsPerYear; p++) {
        const startTaxMonth = p * freqM
        const startCalMonth = (startTaxMonth + TAX_START) % 12
        const startCalYear = startCalMonth >= TAX_START ? ty : ty + 1
        
        const start = new Date(startCalYear, startCalMonth, 1)
        const end = new Date(startCalYear, startCalMonth + freqM, 0)
        
        // Determine if this is the current period
        const isCurrent = now >= start && now <= end
        
        list.push({
          ty,
          p,
          start,
          end,
          isCurrent,
          label: formatPeriodLabel(start, end, freqM),
          shortLabel: formatShortLabel(start, end, freqM),
        })
      }
    }
    return list
  }, [freqM, taxYear])
  
  const periodsPerYear = 12 / freqM
  const currentPeriodIdx = periods.findIndex(p => p.isCurrent)
  const selectedPeriodIdx = currentPeriodIdx + offset
  const selectedPeriod = periods[selectedPeriodIdx] || periods[currentPeriodIdx]
  
  // Group periods by tax year for display
  const groupedByYear = useMemo(() => {
    const groups = {}
    for (const period of periods) {
      const key = `FY ${period.ty}–${String(period.ty + 1).slice(-2)}`
      if (!groups[key]) groups[key] = []
      groups[key].push(period)
    }
    return groups
  }, [periods])
  
  return (
    <div style={{ marginBottom: 0 }}>
      {/* Horizontal scrollable calendar grid */}
      <div style={{
        display: 'flex',
        gap: 24,
        overflowX: 'auto',
        overflowY: 'hidden',
        paddingBottom: 12,
        paddingRight: 8,
        scrollBehavior: 'smooth',
        '&::-webkit-scrollbar': { height: '6px' },
        '&::-webkit-scrollbar-track': { background: 'rgba(0,0,0,0.2)' },
        '&::-webkit-scrollbar-thumb': { background: 'var(--border2)', borderRadius: '3px' },
      }}>
        {Object.entries(groupedByYear).map(([fyLabel, fyPeriods]) => (
          <div key={fyLabel} style={{ flexShrink: 0 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--accent2)',
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 12,
              paddingLeft: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <span style={{ fontSize: 10, color: 'var(--border2)' }}>📅</span>
              {fyLabel}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${Math.min(fyPeriods.length, periodsPerYear)}, minmax(56px, 1fr))`,
              gap: 6,
              padding: '0 2px',
            }}>
              {fyPeriods.map((period, idx) => {
                const isSelected = selectedPeriod.start.getTime() === period.start.getTime()
                const isCurrentPeriod = period.isCurrent
                const isPast = period.end < now
                
                return (
                  <button
                    key={`${period.ty}-${period.p}`}
                    onClick={() => {
                      const diffIdx = periods.indexOf(period) - currentPeriodIdx
                      onOffsetChange(diffIdx)
                    }}
                    style={{
                      position: 'relative',
                      padding: isSelected ? '8px 4px' : '7px 4px',
                      borderRadius: 7,
                      border: isSelected ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                      background: isSelected
                        ? 'rgba(52,211,153,0.2)'
                        : isCurrentPeriod
                        ? 'rgba(96,165,250,0.15)'
                        : isPast
                        ? 'rgba(0,0,0,0.3)'
                        : 'rgba(255,255,255,0.03)',
                      cursor: 'pointer',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 1,
                      color: isSelected ? 'var(--accent)' : isCurrentPeriod ? 'var(--accent2)' : 'var(--text)',
                      boxShadow: isSelected ? '0 4px 12px rgba(52,211,153,0.12)' : 'none',
                      transform: isSelected ? 'scale(1.01)' : 'scale(1)',
                      whiteSpace: 'nowrap',
                      minWidth: 0,
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.target.style.background = isCurrentPeriod
                          ? 'rgba(96,165,250,0.22)'
                          : isPast
                          ? 'rgba(0,0,0,0.4)'
                          : 'rgba(255,255,255,0.05)'
                        e.target.style.transform = 'scale(1.01)'
                        e.target.style.borderColor = isCurrentPeriod ? 'var(--accent2)' : 'var(--border2)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.target.style.background = isCurrentPeriod
                          ? 'rgba(96,165,250,0.15)'
                          : isPast
                          ? 'rgba(0,0,0,0.3)'
                          : 'rgba(255,255,255,0.03)'
                        e.target.style.transform = 'scale(1)'
                        e.target.style.borderColor = 'var(--border)'
                      }
                    }}
                  >
                    <span style={{
                      fontSize: 10,
                      fontWeight: isSelected || isCurrentPeriod ? 700 : 600,
                      letterSpacing: -0.3,
                      lineHeight: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {period.shortLabel}
                    </span>
                    {isCurrentPeriod && (
                      <span style={{
                        fontSize: 6,
                        fontWeight: 800,
                        color: isSelected ? 'var(--accent)' : 'var(--accent2)',
                        textTransform: 'uppercase',
                        letterSpacing: 0.4,
                        marginTop: 0,
                      }}>
                        ●
                      </span>
                    )}
                    {isSelected && !isCurrentPeriod && (
                      <span style={{
                        fontSize: 6,
                        fontWeight: 700,
                        color: 'var(--accent)',
                        textTransform: 'uppercase',
                        letterSpacing: 0.3,
                        marginTop: 0,
                      }}>
                        ✓
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatPeriodLabel(start, end, freqM) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  if (freqM === 1) {
    return months[start.getMonth()]
  } else if (freqM === 2) {
    const endMonth = months[end.getMonth()]
    return `${months[start.getMonth()]}–${endMonth}`
  } else if (freqM === 6) {
    const endMonth = months[end.getMonth()]
    return `${months[start.getMonth()]}–${endMonth}`
  }
  return ''
}

function formatShortLabel(start, end, freqM) {
  const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
  if (freqM === 1) {
    return months[start.getMonth()]
  } else if (freqM === 2) {
    return `${months[start.getMonth()]}${months[end.getMonth()]}`
  } else if (freqM === 6) {
    return `${months[start.getMonth()]}–${months[end.getMonth()]}`
  }
  return ''
}
