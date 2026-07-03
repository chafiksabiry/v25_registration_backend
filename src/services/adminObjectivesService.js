import mongoose from 'mongoose';
import HarxObjectives from '../models/HarxObjectives.js';

const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing'];

function validationError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function startOfYear(year = new Date().getFullYear()) {
  return new Date(Date.UTC(year, 0, 1));
}

function parseOptionalNumber(value, label) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw validationError(`${label} : valeur invalide.`);
  }
  return parsed;
}

async function sumCollectionAmount(db, collection, match = {}, field = 'amount') {
  const [result] = await db
    .collection(collection)
    .aggregate([
      { $match: match },
      { $group: { _id: null, total: { $sum: `$${field}` } } },
    ])
    .toArray();
  return result?.total ?? 0;
}

async function countRepsOnboarded(db) {
  return db.collection('agents').countDocuments({
    'onboardingProgress.phases.phase1.status': 'completed',
    'onboardingProgress.phases.phase2.status': 'completed',
    'onboardingProgress.phases.phase3.status': 'completed',
    'onboardingProgress.phases.phase4.status': 'completed',
    'onboardingProgress.phases.phase5.status': 'completed',
  });
}

async function countCompaniesOnboarded(db) {
  const entries = await db
    .collection('onboardingprogresses')
    .find({ phases: { $exists: true, $ne: [] } })
    .project({ phases: 1 })
    .toArray();

  return entries.filter(
    (entry) => Array.isArray(entry.phases) && entry.phases.every((phase) => phase.status === 'completed'),
  ).length;
}

export async function getHarxActualMetrics() {
  const db = mongoose.connection.db;
  const year = new Date().getFullYear();
  const yearStart = startOfYear(year);
  const yearMatch = { createdAt: { $gte: yearStart } };

  const [
    companies,
    repsOnboarded,
    repsWithActiveSubscription,
    annualCommissions,
    annualCompanyPayments,
    annualPhonePayments,
    annualHarxShare,
  ] = await Promise.all([
    countCompaniesOnboarded(db),
    countRepsOnboarded(db),
    db.collection('agents').countDocuments({ subscriptionStatus: { $in: ACTIVE_SUBSCRIPTION_STATUSES } }),
    sumCollectionAmount(db, 'harxcommissions', yearMatch),
    sumCollectionAmount(db, 'companypayments', { status: 'succeeded', ...yearMatch }, 'amount'),
    sumCollectionAmount(db, 'phonenumberpayments', { status: 'succeeded', ...yearMatch }, 'amount'),
    sumCollectionAmount(db, 'reptransactions', yearMatch, 'harxShare'),
  ]);

  const centsToEuros = (cents) => (cents || 0) / 100;

  const annualRevenue =
    annualCommissions +
    centsToEuros(annualCompanyPayments) +
    centsToEuros(annualPhonePayments) +
    annualHarxShare;

  const annualProfit = annualCommissions + annualHarxShare + centsToEuros(annualCompanyPayments);

  return {
    year,
    companies,
    repsOnboarded,
    repsWithActiveSubscription,
    annualRevenue,
    annualProfit,
  };
}

function resolvedCompaniesTarget(doc) {
  if (doc.companiesOnboarded != null) return doc.companiesOnboarded;
  if (doc.companiesSigned != null) return doc.companiesSigned;
  return null;
}

function serializeTargets(doc) {
  return {
    year: doc.year,
    companies: resolvedCompaniesTarget(doc),
    repsOnboarded: doc.repsOnboarded,
    repsWithActiveSubscription: doc.repsWithActiveSubscription,
    annualRevenue: doc.annualRevenue,
    annualProfit: doc.annualProfit,
    notes: doc.notes || '',
    updatedAt: doc.updatedAt?.toISOString?.() || null,
  };
}

async function getOrCreateTargetsDoc() {
  let doc = await HarxObjectives.findOne({ key: 'default' });
  if (!doc) {
    doc = await HarxObjectives.create({
      key: 'default',
      year: new Date().getFullYear(),
    });
  }
  return doc;
}

function buildComparisonRow({ key, label, target, actual, unit, description }) {
  const hasTarget = target != null && target > 0;
  const progress = hasTarget ? Math.min(100, Math.round((actual / target) * 100)) : null;
  const gap = hasTarget ? actual - target : null;

  return {
    key,
    label,
    target,
    actual,
    progress,
    gap,
    unit,
    description: description || null,
    status: !hasTarget ? 'no_target' : progress >= 100 ? 'reached' : progress >= 75 ? 'on_track' : 'behind',
  };
}

function buildComparison(targets, actual) {
  return [
    buildComparisonRow({
      key: 'companies',
      label: 'Entreprises',
      target: targets.companies,
      actual: actual.companies,
      unit: 'count',
    }),
    buildComparisonRow({
      key: 'repsOnboarded',
      label: 'REPs onboardés',
      target: targets.repsOnboarded,
      actual: actual.repsOnboarded,
      unit: 'count',
    }),
    buildComparisonRow({
      key: 'repsWithActiveSubscription',
      label: 'REPs abonnement actif',
      target: targets.repsWithActiveSubscription,
      actual: actual.repsWithActiveSubscription,
      unit: 'count',
    }),
    buildComparisonRow({
      key: 'annualRevenue',
      label: `Chiffre d'affaires annuel ${actual.year}`,
      target: targets.annualRevenue,
      actual: actual.annualRevenue,
      unit: 'money',
      description:
        'Total encaissé via la plateforme : commissions HARX, abonnements entreprises, numéros téléphoniques et part HARX sur les transactions REPs.',
    }),
    buildComparisonRow({
      key: 'annualProfit',
      label: `Profit HARX annuel ${actual.year}`,
      target: targets.annualProfit,
      actual: actual.annualProfit,
      unit: 'money',
      description:
        'Marge conservée par HARX : commissions + part HARX sur transactions REPs + abonnements entreprises (hors reversements téléphonie).',
    }),
  ];
}

export async function getHarxObjectivesOverview() {
  const [doc, actual] = await Promise.all([getOrCreateTargetsDoc(), getHarxActualMetrics()]);
  const targets = serializeTargets(doc);

  return {
    targets,
    actual,
    comparison: buildComparison(targets, actual),
  };
}

export async function updateHarxObjectives(payload = {}) {
  const doc = await getOrCreateTargetsDoc();

  if (payload.year != null) {
    const year = Number(payload.year);
    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      throw validationError('Année objectif invalide.');
    }
    doc.year = year;
  }

  if ('companies' in payload || 'companiesOnboarded' in payload) {
    const raw = payload.companies ?? payload.companiesOnboarded;
    doc.companiesOnboarded = parseOptionalNumber(raw, 'Entreprises');
    doc.companiesSigned = null;
  }
  if ('repsOnboarded' in payload) doc.repsOnboarded = parseOptionalNumber(payload.repsOnboarded, 'REPs onboardés');
  if ('repsWithActiveSubscription' in payload) {
    doc.repsWithActiveSubscription = parseOptionalNumber(
      payload.repsWithActiveSubscription,
      'REPs abonnement actif',
    );
  }
  if ('annualRevenue' in payload) doc.annualRevenue = parseOptionalNumber(payload.annualRevenue, 'CA annuel');
  if ('annualProfit' in payload) doc.annualProfit = parseOptionalNumber(payload.annualProfit, 'Profit annuel');
  if ('notes' in payload) doc.notes = String(payload.notes || '').trim();

  await doc.save();

  const actual = await getHarxActualMetrics();
  const targets = serializeTargets(doc);

  return {
    targets,
    actual,
    comparison: buildComparison(targets, actual),
  };
}
