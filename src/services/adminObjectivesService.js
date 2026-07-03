import mongoose from 'mongoose';
import User from '../models/User.js';

const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing'];

function startOfYear(year = new Date().getFullYear()) {
  return new Date(Date.UTC(year, 0, 1));
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

async function countActiveSubscriptions(db) {
  const activeSubs = await db
    .collection('subscriptions')
    .find({ status: { $in: ACTIVE_SUBSCRIPTION_STATUSES } })
    .project({ companyId: 1, planId: 1 })
    .toArray();

  const uniqueCompanies = new Set(
    activeSubs.map((sub) => String(sub.companyId)).filter(Boolean),
  );

  return {
    count: uniqueCompanies.size,
    subscriptions: activeSubs.length,
  };
}

async function computeMrr(db) {
  const activeSubs = await db
    .collection('subscriptions')
    .find({ status: { $in: ACTIVE_SUBSCRIPTION_STATUSES } })
    .project({ planId: 1 })
    .toArray();

  if (!activeSubs.length) return 0;

  const planIds = [
    ...new Set(
      activeSubs
        .map((sub) => sub.planId)
        .filter((id) => id && mongoose.isValidObjectId(String(id)))
        .map((id) => new mongoose.Types.ObjectId(String(id))),
    ),
  ];

  if (!planIds.length) return 0;

  const plans = await db
    .collection('subscriptionplans')
    .find({ _id: { $in: planIds } })
    .project({ price: 1 })
    .toArray();

  const priceByPlanId = new Map(plans.map((plan) => [String(plan._id), plan.price || 0]));

  return activeSubs.reduce((sum, sub) => {
    const price = priceByPlanId.get(String(sub.planId)) || 0;
    return sum + price;
  }, 0);
}

export async function getHarxObjectives() {
  const db = mongoose.connection.db;
  const year = new Date().getFullYear();
  const yearStart = startOfYear(year);
  const yearMatch = { createdAt: { $gte: yearStart } };

  const [
    companiesRegistered,
    repsRegistered,
    repsOnboarded,
    companiesOnboarded,
    activeSubscriptionStats,
    repsWithActiveSub,
    harxWallet,
    mrr,
    totalCommissions,
    annualCommissions,
    totalCompanyPayments,
    annualCompanyPayments,
    totalPhonePayments,
    annualPhonePayments,
    totalHarxShare,
    annualHarxShare,
    totalRepWalletBalance,
    totalCompanyWalletBalance,
    totalMinutesPurchased,
  ] = await Promise.all([
    User.countDocuments({ typeUser: 'company' }),
    User.countDocuments({ typeUser: 'rep' }),
    countRepsOnboarded(db),
    countCompaniesOnboarded(db),
    countActiveSubscriptions(db),
    db.collection('agents').countDocuments({ subscriptionStatus: { $in: ACTIVE_SUBSCRIPTION_STATUSES } }),
    db.collection('harxwallets').findOne({}),
    computeMrr(db),
    sumCollectionAmount(db, 'harxcommissions'),
    sumCollectionAmount(db, 'harxcommissions', yearMatch),
    sumCollectionAmount(db, 'companypayments', { status: 'succeeded' }, 'amount'),
    sumCollectionAmount(db, 'companypayments', { status: 'succeeded', ...yearMatch }, 'amount'),
    sumCollectionAmount(db, 'phonenumberpayments', { status: 'succeeded' }, 'amount'),
    sumCollectionAmount(db, 'phonenumberpayments', { status: 'succeeded', ...yearMatch }, 'amount'),
    sumCollectionAmount(db, 'reptransactions', {}, 'harxShare'),
    sumCollectionAmount(db, 'reptransactions', yearMatch, 'harxShare'),
    sumCollectionAmount(db, 'agentwallets', {}, 'availableBalance'),
    sumCollectionAmount(db, 'walletcompanies', {}, 'balance'),
    sumCollectionAmount(db, 'minutescompanies', {}, 'purchasedMinutes'),
  ]);

  const centsToEuros = (cents) => (cents || 0) / 100;

  const lifetimeRevenue =
    (harxWallet?.lifetimeEarnings ?? 0) +
    totalCommissions +
    centsToEuros(totalCompanyPayments) +
    centsToEuros(totalPhonePayments) +
    totalHarxShare;

  const annualRevenue =
    annualCommissions +
    centsToEuros(annualCompanyPayments) +
    centsToEuros(annualPhonePayments) +
    annualHarxShare;

  const annualProfit = annualCommissions + annualHarxShare + centsToEuros(annualCompanyPayments);

  return {
    year,
    growth: {
      companiesRegistered,
      companiesSigned: activeSubscriptionStats.count,
      activeSubscriptions: activeSubscriptionStats.subscriptions,
      companiesOnboarded,
      repsRegistered,
      repsOnboarded,
      repsWithActiveSubscription: repsWithActiveSub,
      repsInProgress: Math.max(repsRegistered - repsOnboarded, 0),
      companiesInProgress: Math.max(companiesRegistered - companiesOnboarded, 0),
    },
    financial: {
      harxWalletBalance: harxWallet?.balance ?? 0,
      lifetimeRevenue,
      annualRevenue,
      annualProfit,
      mrr,
      totalCommissions,
      annualCommissions,
      companyPaymentsTotal: centsToEuros(totalCompanyPayments),
      annualCompanyPayments: centsToEuros(annualCompanyPayments),
      phoneLineRevenue: centsToEuros(totalPhonePayments),
      annualPhoneLineRevenue: centsToEuros(annualPhonePayments),
      gigHarxShareTotal: totalHarxShare,
      annualGigHarxShare: annualHarxShare,
      totalRepWalletBalance,
      totalCompanyWalletBalance,
      totalMinutesPurchased,
    },
  };
}
