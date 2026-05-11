export const CATEGORY_GROUPS = [
  {
    label: 'Expenses',
    color: '#f87171',
    bg: 'rgba(248,113,113,0.12)',
    border: 'rgba(248,113,113,0.3)',
    categories: [
      'Business Services',
      'Charity',
      'Childcare',
      'Education',
      'Entertainment',
      'Food & Drink',
      'Government & Taxes',
      'Gym & Fitness',
      'Health & Medical',
      'Insurance',
      'Internet & Phone',
      'Loan',
      'Medical Fees',
      'Other',
      'Personal Care',
      'Pharmacy',
      'Power & Gas',
      'Rent & Mortgage',
      'Shopping',
      'Transport and Fuel',
      'Travel & Accommodation',
      'Utilities',
    ],
  },
  {
    label: 'Income',
    color: '#34d399',
    bg: 'rgba(52,211,153,0.12)',
    border: 'rgba(52,211,153,0.3)',
    categories: ['Income'],
  },
  {
    label: 'Investments',
    color: '#60a5fa',
    bg: 'rgba(96,165,250,0.12)',
    border: 'rgba(96,165,250,0.3)',
    categories: ['Investments'],
  },
  {
    label: 'Personal Transfers',
    color: '#94a3b8',
    bg: 'rgba(148,163,184,0.12)',
    border: 'rgba(148,163,184,0.3)',
    categories: ['Personal Transfer'],
  },
]

export function getCategoryGroup(category) {
  if (!category || category === 'Uncategorised') return null
  return CATEGORY_GROUPS.find(g => g.categories.includes(category)) ?? null
}

export function getCategoryColor(category) {
  return getCategoryGroup(category)?.color ?? 'var(--muted)'
}
