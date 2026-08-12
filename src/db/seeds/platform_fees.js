exports.seed = async function (knex) {
  await knex('platform_fees').del();
  await knex('platform_fees').insert([
    { platform: 'eBay', fee_percent: 0.136, flat_fee: 0.40, notes: '% on item+shipping+tax; Store subscription drops to ~12.7%; $0.30 flat if order <=$10', last_verified: '2026-07-01' },
    { platform: 'Mercari', fee_percent: 0.10, flat_fee: 0, notes: 'Flat on item + buyer-paid shipping', last_verified: '2026-01-01' },
    { platform: 'Poshmark (>=$15)', fee_percent: 0.20, flat_fee: 0, notes: null, last_verified: '2026-05-01' },
    { platform: 'Poshmark (<$15 flat)', fee_percent: 0, flat_fee: 2.95, notes: null, last_verified: '2026-05-01' },
    { platform: 'Depop', fee_percent: 0.033, flat_fee: 0.45, notes: '0% commission in US/UK, payment processing only', last_verified: '2026-01-01' },
    { platform: 'Facebook Marketplace', fee_percent: 0.05, flat_fee: 0, notes: 'Local pickup = $0, zero out manually', last_verified: '2026-01-01' },
    { platform: 'Google Merchant', fee_percent: 0, flat_fee: 0, notes: 'Not a marketplace commission — free listings, Shopping Ads billed separately as CPC', last_verified: '2026-01-01' },
    { platform: 'Other', fee_percent: 0, flat_fee: 0, notes: null, last_verified: null },
  ]);
};
