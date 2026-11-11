export const DEFAULT_MINUTE_PACKS = [
  { label: 'Standard', minutes: 150, priceCents: 1000, active: true },
  { label: 'Pro', minutes: 500, priceCents: 3200, active: true },
  { label: 'Expert', minutes: 1000, priceCents: 6200, active: true },
];

export const DEFAULT_MINUTES_CUSTOM_RATE_CENTS = Math.round((1000 / 150) * 100) / 100;

export const DEFAULT_PHONE_LINE_PRICING = {
  setupFeeCents: parseInt(process.env.PHONE_LINE_SETUP_FEE_CENTS || '999', 10),
  currency: (process.env.PHONE_LINE_CURRENCY || 'EUR').toUpperCase(),
  trialDays: parseInt(process.env.PHONE_LINE_TRIAL_DAYS || '15', 10),
};

export function deriveCustomRateFromPacks(packs) {
  const standard = packs.find((pack) => pack.minutes === 150) || packs[0];
  if (!standard?.minutes || !standard?.priceCents) {
    return DEFAULT_MINUTES_CUSTOM_RATE_CENTS;
  }
  return Math.round((standard.priceCents / standard.minutes) * 100) / 100;
}
