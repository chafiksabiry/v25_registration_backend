import PlatformPricing from '../models/PlatformPricing.js';
import {
  DEFAULT_MINUTE_PACKS,
  DEFAULT_MINUTES_CUSTOM_RATE_CENTS,
  DEFAULT_PHONE_LINE_PRICING,
  deriveCustomRateFromPacks,
} from '../config/platformPricingDefaults.js';

function validationError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function getOrCreatePricingDoc() {
  let doc = await PlatformPricing.findOne({ key: 'default' });
  if (!doc) {
    doc = await PlatformPricing.create({
      key: 'default',
      minutePacks: DEFAULT_MINUTE_PACKS,
      minutesCustomRateCents: DEFAULT_MINUTES_CUSTOM_RATE_CENTS,
      phoneLineSetupFeeCents: DEFAULT_PHONE_LINE_PRICING.setupFeeCents,
      phoneLineCurrency: DEFAULT_PHONE_LINE_PRICING.currency,
      phoneLineTrialDays: DEFAULT_PHONE_LINE_PRICING.trialDays,
    });
  }
  return doc;
}

function normalizeMinutePacks(rawPacks) {
  if (!Array.isArray(rawPacks) || !rawPacks.length) {
    throw validationError('Au moins une offre minutes est requise.');
  }

  const packs = rawPacks.map((pack, index) => {
    const label = String(pack.label || '').trim();
    const minutes = Number(pack.minutes);
    const priceCents = Number(pack.priceCents);
    const active = pack.active !== false;

    if (!label) throw validationError(`Offre ${index + 1} : libellé requis.`);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw validationError(`Offre « ${label} » : minutes invalides.`);
    }
    if (!Number.isFinite(priceCents) || priceCents <= 0) {
      throw validationError(`Offre « ${label} » : prix invalide.`);
    }

    return { label, minutes: Math.round(minutes), priceCents: Math.round(priceCents), active };
  });

  const minuteSet = new Set();
  packs.forEach((pack) => {
    if (minuteSet.has(pack.minutes)) {
      throw validationError(`Doublon sur ${pack.minutes} minutes.`);
    }
    minuteSet.add(pack.minutes);
  });

  return packs.sort((a, b) => a.minutes - b.minutes);
}

function serializeMinutesPricing(doc) {
  const activePacks = doc.minutePacks.filter((pack) => pack.active !== false);
  return {
    minutePacks: doc.minutePacks.map((pack) => ({
      label: pack.label,
      minutes: pack.minutes,
      priceCents: pack.priceCents,
      active: pack.active !== false,
      priceEuros: pack.priceCents / 100,
    })),
    activeMinutePacks: activePacks.map((pack) => ({
      label: pack.label,
      minutes: pack.minutes,
      priceCents: pack.priceCents,
      priceEuros: pack.priceCents / 100,
    })),
    minutesCustomRateCents: doc.minutesCustomRateCents,
    minutesCustomRateEuros: doc.minutesCustomRateCents / 100,
    updatedAt: doc.updatedAt,
  };
}

function serializePhonePricing(doc) {
  return {
    setupFeeCents: doc.phoneLineSetupFeeCents,
    setupFeeEuros: doc.phoneLineSetupFeeCents / 100,
    currency: doc.phoneLineCurrency,
    trialDays: doc.phoneLineTrialDays,
    updatedAt: doc.updatedAt,
  };
}

export async function getMinutesPricing() {
  const doc = await getOrCreatePricingDoc();
  return serializeMinutesPricing(doc);
}

export async function updateMinutesPricing(payload = {}) {
  const doc = await getOrCreatePricingDoc();
  const minutePacks = normalizeMinutePacks(payload.minutePacks);

  let customRate = doc.minutesCustomRateCents;
  if (payload.minutesCustomRateCents != null && payload.minutesCustomRateCents !== '') {
    customRate = Number(payload.minutesCustomRateCents);
    if (!Number.isFinite(customRate) || customRate <= 0) {
      throw validationError('Tarif minute personnalisé invalide.');
    }
    customRate = Math.round(customRate * 100) / 100;
  } else if (payload.autoCustomRate !== false) {
    customRate = deriveCustomRateFromPacks(minutePacks.filter((pack) => pack.active));
  }

  doc.minutePacks = minutePacks;
  doc.minutesCustomRateCents = customRate;
  await doc.save();

  return serializeMinutesPricing(doc);
}

export async function getPhoneLinePricing() {
  const doc = await getOrCreatePricingDoc();
  return serializePhonePricing(doc);
}

export async function updatePhoneLinePricing(payload = {}) {
  const doc = await getOrCreatePricingDoc();

  if (payload.setupFeeCents != null) {
    const setupFeeCents = Number(payload.setupFeeCents);
    if (!Number.isFinite(setupFeeCents) || setupFeeCents < 0) {
      throw validationError('Prix ligne téléphonique invalide.');
    }
    doc.phoneLineSetupFeeCents = Math.round(setupFeeCents);
  }

  if (payload.setupFeeEuros != null && payload.setupFeeCents == null) {
    const setupFeeEuros = Number(payload.setupFeeEuros);
    if (!Number.isFinite(setupFeeEuros) || setupFeeEuros < 0) {
      throw validationError('Prix ligne téléphonique invalide.');
    }
    doc.phoneLineSetupFeeCents = Math.round(setupFeeEuros * 100);
  }

  if (payload.currency != null) {
    const currency = String(payload.currency).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw validationError('Devise invalide (format ISO, ex. EUR).');
    }
    doc.phoneLineCurrency = currency;
  }

  if (payload.trialDays != null) {
    const trialDays = Number(payload.trialDays);
    if (!Number.isFinite(trialDays) || trialDays < 0 || trialDays > 365) {
      throw validationError('Durée essai invalide (0–365 jours).');
    }
    doc.phoneLineTrialDays = Math.round(trialDays);
  }

  await doc.save();
  return serializePhonePricing(doc);
}
