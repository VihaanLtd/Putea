/**
 * NZ GST Input Tax Credit Rules by Expense Category
 *
 * Sources verified May 2026:
 *   - IRD Exempt Supplies:          https://www.ird.govt.nz/gst/charging-gst/exempt-supplies
 *   - IRD Claiming GST:             https://www.ird.govt.nz/gst/claiming-gst
 *   - IRD Entertainment Expenses:   https://www.ird.govt.nz/income-tax/income-tax-for-businesses-and-organisations/types-of-business-expenses/entertainment-expenses
 *   - IRD IR268 (2024):             https://www.ird.govt.nz/-/media/project/ir/home/documents/forms-and-guides/ir200---ir299/ir268/ir268-2024.pdf
 *   - IRD GST Guide IR375 (Mar 2026):https://www.ird.govt.nz/-/media/project/ir/home/documents/forms-and-guides/ir300---ir399/ir375/ir375.pdf
 *   - IRD Vehicle Expenses:         https://www.ird.govt.nz/vehicle-expenses
 *   - Beany Entertainment Guide:    https://www.beany.com/en-nz/resources/entertainment-expenses
 *   - Lifetimes Business Tax 2026:  https://lifetimes.co.nz/blog/business-tax/business-tax-in-new-zealand-2026-gst-income-tax-and-ird-submissions
 *
 * GST rate in NZ: 15% (unchanged)
 * GST fraction for extracting from GST-inclusive price: 15/115 ≈ 0.1304
 *
 * claimPct  — percentage of the GST component you can claim as input tax credit (0–100)
 * apportioned — true means the user must supply their own % based on actual business use
 * rule      — the IRD rule or section that governs this treatment
 * notes     — plain-English explanation
 */

export const GST_RULES = {
  // ── Expenses ────────────────────────────────────────────────────────────

  'Food & Drink': {
    claimPct:     50,
    apportioned:  false,
    rule:         'Entertainment rule (IR268)',
    notes:        'Client meals, staff lunches, food/drink gifts — 50% limit applies regardless of actual business ratio. ' +
                  'Exception: employee meals during business travel, or food at a 4hr+ conference = 100%.',
  },

  'Entertainment': {
    claimPct:     50,
    apportioned:  false,
    rule:         'Entertainment rule (IR268)',
    notes:        'Sports events, boat hire, holiday homes, office parties, client hospitality — 50% of GST claimable. ' +
                  'Exception: entertainment wholly outside NZ or qualifying charitable events = 100%.',
  },

  'Transport and Fuel': {
    claimPct:     75,
    apportioned:  true,
    rule:         'Mixed-use apportionment (GST Act s.20)',
    notes:        'IRD requires actual business-use % via logbook. ' +
                  '75% used here as a conservative default for mixed personal/business vehicles. ' +
                  'Update to your actual logbook % for accuracy. Dedicated business-only vehicle = 100%.',
  },

  'Shopping': {
    claimPct:     100,
    apportioned:  false,
    rule:         'Standard business purchase',
    notes:        'Assumes goods purchased for business use. ' +
                  'If items have any private use, apportion to the business-use percentage only.',
  },

  'Health & Medical': {
    claimPct:     100,
    apportioned:  false,
    rule:         'Standard taxable supply',
    notes:        'Medical services from GST-registered providers carry GST at 15%. ' +
                  'Business-related health expenses (employee first aid, health & safety) are fully claimable. ' +
                  'Note: public hospital fees carry no GST as a government entity.',
  },

  'Medical Fees': {
    claimPct:     100,
    apportioned:  false,
    rule:         'Standard taxable supply',
    notes:        'GP and specialist fees from GST-registered practices carry GST — claimable if business-related. ' +
                  'Private medical insurance premiums also carry GST.',
  },

  'Pharmacy': {
    claimPct:     100,
    apportioned:  false,
    rule:         'Standard taxable supply',
    notes:        'Most pharmacy purchases (OTC medicines, first aid supplies) carry 15% GST and are fully claimable ' +
                  'if purchased for business use (e.g. workplace first aid kit).',
  },

  'Gym & Fitness': {
    claimPct:     0,
    apportioned:  false,
    rule:         'Private expense — not claimable',
    notes:        'Personal fitness is not a business expense. No GST can be claimed. ' +
                  'Exception: if provided to employees as a taxable fringe benefit, claim 100% and account for FBT.',
  },

  'Utilities': {
    claimPct:     100,
    apportioned:  false,
    rule:         'Standard business expense',
    notes:        'Business premises utilities (power, water, gas) are fully claimable. ' +
                  'If working from home, apportion to the business-use floor-area percentage only.',
  },

  'Power & Gas': {
    claimPct:     100,
    apportioned:  false,
    rule:         'Standard business expense',
    notes:        'Electricity and gas for business premises — 100% claimable. ' +
                  'Home-office use: apply the floor-area ratio (business m² ÷ total home m²).',
  },

  'Internet & Phone': {
    claimPct:     75,
    apportioned:  true,
    rule:         'Mixed-use apportionment (GST Act s.20)',
    notes:        'Mixed personal/business use must be apportioned. ' +
                  '75% default is a common conservative estimate for a small business owner. ' +
                  'Adjust to your actual business-use percentage. Dedicated business line = 100%.',
  },

  'Insurance': {
    claimPct:     100,
    apportioned:  false,
    rule:         'Standard taxable supply',
    notes:        'Commercial insurance (business, contents, professional indemnity, vehicle) carries 15% GST — fully claimable. ' +
                  'Note: residential property insurance is NOT claimable (linked to exempt residential rent).',
  },

  'Rent & Mortgage': {
    claimPct:     0,
    apportioned:  false,
    rule:         'Exempt supply (GST Act Schedule 1)',
    notes:        'Residential rent is GST-exempt — no GST is charged and none can be claimed. ' +
                  'Home mortgage repayments are a financial service — also exempt. ' +
                  'Commercial office/premises rent IS taxable at 15% — change this to 100% if your rent is for business premises.',
  },

  'Loan': {
    claimPct:     0,
    apportioned:  false,
    rule:         'Exempt supply — financial service (GST Act s.3)',
    notes:        'Loan repayments and interest charges are financial services, which are GST-exempt in NZ. ' +
                  'No GST is charged on interest, so no GST can be claimed.',
  },

  'Education': {
    claimPct:     0,
    apportioned:  false,
    rule:         'Largely exempt supply',
    notes:        'Tuition fees at schools, universities, and polytechs are GST-exempt. ' +
                  'Commercial training courses (CPD, professional development) from non-educational providers ' +
                  'may carry GST at 15% — if so, change to 100% for those invoices.',
  },

  'Childcare': {
    claimPct:     0,
    apportioned:  false,
    rule:         'Private expense — not claimable',
    notes:        'Childcare is a personal expense. No GST input credit is claimable. ' +
                  'Working for Families and childcare subsidies are handled through income tax, not GST.',
  },

  'Travel & Accommodation': {
    claimPct:     100,
    apportioned:  false,
    rule:         'Standard business expense (IR268 — 100% deductible travel)',
    notes:        'Flights, hotels, and transport for business travel are fully claimable. ' +
                  'Accommodation carries 15% GST. This differs from entertainment — business travel meals ' +
                  'are also 100% claimable (employee away from home base).',
  },

  'Business Services': {
    claimPct:     100,
    apportioned:  false,
    rule:         'Standard business expense',
    notes:        'Accounting, legal, consulting, software subscriptions, marketing, advertising — ' +
                  'all standard business services carry 15% GST and are fully claimable.',
  },

  'Government & Taxes': {
    claimPct:     0,
    apportioned:  false,
    rule:         'No GST charged',
    notes:        'IRD income tax, GST payments, ACC levies, and council rates do not carry GST. ' +
                  'There is no GST component to claim.',
  },

  'Charity': {
    claimPct:     0,
    apportioned:  false,
    rule:         'Donation — no GST',
    notes:        'Donations to registered charities are not subject to GST. ' +
                  'Sponsorship of a charity event where you receive a benefit in return may carry GST — treat as entertainment.',
  },

  'Personal Care': {
    claimPct:     0,
    apportioned:  false,
    rule:         'Private expense — not claimable',
    notes:        'Haircuts, clothing, personal grooming — private expenses, no GST claimable. ' +
                  'Exception: uniforms or protective clothing required specifically for work may be 100% claimable.',
  },

  'Investments': {
    claimPct:     0,
    apportioned:  false,
    rule:         'Exempt supply — financial service (GST Act s.3)',
    notes:        'Investment transactions (shares, funds, managed investments) are financial services — GST-exempt. ' +
                  'Brokerage fees from a GST-registered broker may carry GST — claimable if for taxable business activity.',
  },

  'Personal Transfer': {
    claimPct:     0,
    apportioned:  false,
    rule:         'Not a taxable supply',
    notes:        'Transfers between your own accounts are not a purchase of goods or services. ' +
                  'No GST implications.',
  },

  'Other': {
    claimPct:     100,
    apportioned:  false,
    rule:         'Standard business expense (default)',
    notes:        'Assumed to be a standard business purchase with 15% GST. ' +
                  'Review uncategorised transactions and assign proper categories for accurate GST treatment.',
  },

  'Uncategorised': {
    claimPct:     100,
    apportioned:  false,
    rule:         'Standard business expense (default — unverified)',
    notes:        'No category assigned. Treated as 100% claimable by default. ' +
                  'Assign a category to apply the correct GST treatment.',
  },
}

/**
 * Returns the GST rule for a category, falling back to the "Other" default.
 */
export function getGstRule(category) {
  return GST_RULES[category] ?? GST_RULES['Other']
}

/**
 * Calculates the claimable GST amount from a GST-inclusive expense amount.
 * @param {number} inclAmount  - GST-inclusive amount (absolute value)
 * @param {string} category    - expense category name
 * @returns {{ gstTotal, gstClaimable, claimPct, rule }}
 */
export function calcGst(inclAmount, category) {
  const rule       = getGstRule(category)
  const gstTotal   = inclAmount * (15 / 115)
  const gstClaimable = gstTotal * (rule.claimPct / 100)
  return {
    gstTotal,
    gstClaimable,
    claimPct:  rule.claimPct,
    rule,
  }
}
