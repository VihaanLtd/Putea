// Personal configuration template — copy this file to `personal.js` and fill
// in your actual details. `personal.js` is gitignored so your data never gets
// committed.
//
//   cp api/personal.example.js api/personal.js
//
// Then edit api/personal.js with your real values.

export default {
  // Frontend + backend email allowlist for Clerk auth.
  allowedEmails: [
    // 'you@example.com',
  ],

  // Property portfolio shown on the dashboard.
  properties: [
    // { address: '1 Example Street, Auckland', value: 1000000, source: 'Manual', sourceDate: '2026-01-01' },
  ],

  // Personalised context injected into the AI advisor system prompt.
  // Leave empty to use a generic financial-advisor prompt.
  aiContext: {
    userName: '',           // e.g. 'Alex'
    businessSummary: '',    // e.g. 'runs an IT consulting company and owns 3 rental properties'
  },

  // Home Office module seed data.
  // Companies, business spaces and assignments to pre-populate on first run.
  homeOffice: {
    house: { total_floor_area_sqm: 150, address: '' },
    companies: [
      // { name: 'Acme Ltd', gst_registered: 1, gst_filing_frequency: '2-monthly', tax_rate: 0.28, company_type: 'IT' },
    ],
    spaces: [
      // { name: 'Office', area_sqm: 12, is_exclusive_business: 1, hours_per_week_business: null, notes: null },
    ],
    // Pairs of [companyName, spaceName] linking each company to its space(s).
    assignments: [
      // ['Acme Ltd', 'Office'],
    ],
    // Auto-tag rules. Keep these generic — they don't expose anything personal.
    rules: [
      { pattern: 'genesis energy',                  category: 'Electricity',           use: 1.0, conf: 'suggest', kind: 'home' },
      { pattern: 'watercare',                       category: 'Water',                 use: 1.0, conf: 'auto',    kind: 'home' },
      { pattern: 'skinny|2degrees|spark|vodafone',  category: 'Internet',              use: 0.5, conf: 'suggest', kind: 'home' },
      { pattern: 'tower insurance|ami insurance',   category: 'Insurance (house)',     use: 1.0, conf: 'auto',    kind: 'home' },
      { pattern: 'auckland council',                category: 'Council Rates',         use: 1.0, conf: 'auto',    kind: 'home' },
      { pattern: 'mitre 10|bunnings|placemakers',   category: 'Repairs & Maintenance', use: null, conf: 'suggest', kind: 'home' },
    ],
  },
}
