import mongoose from 'mongoose';
import User from '../models/User.js';
import {
  formatCompanyOnboarding,
  formatRepOnboarding,
} from './adminOnboardingUtils.js';
import { populateAgentForAdmin, populateCompanyForAdmin } from './adminPopulateUtils.js';
import { enrichAgentMedia } from './adminAgentMediaUtils.js';

const LIST_LIMIT = 50;

function oid(value) {
  return new mongoose.Types.ObjectId(String(value));
}

function serialize(value) {
  if (value == null) return value;
  if (value instanceof mongoose.Types.ObjectId) return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)]));
  }
  return value;
}

function sanitizeUser(user) {
  if (!user) return null;
  const { password, verificationCode, ...safe } = user;
  return serialize(safe);
}

function sanitizeAgent(agent) {
  if (!agent) return null;
  return serialize({
    _id: agent._id,
    userId: agent.userId,
    status: agent.status,
    subscriptionStatus: agent.subscriptionStatus,
    plan: agent.plan,
    planName: agent.planName,
    stripeCustomerId: agent.stripeCustomerId,
    isBasicProfileCompleted: agent.isBasicProfileCompleted,
    personalInfo: agent.personalInfo,
    professionalSummary: agent.professionalSummary,
    skills: agent.skills,
    experience: agent.experience,
    achievements: agent.achievements,
    availability: agent.availability,
    onboardingProgress: agent.onboardingProgress,
    mediaSummary: agent.mediaSummary,
    gigsCount: Array.isArray(agent.gigs) ? agent.gigs.length : 0,
    createdAt: agent.createdAt,
    lastUpdated: agent.lastUpdated,
  });
}

function sanitizeCompany(company) {
  if (!company) return null;
  return serialize(company);
}

async function loadRepFinancials(db, agent) {
  const agentId = agent._id;
  const agentIdStr = String(agentId);

  const [wallet, transactions, withdrawals, harxCommissions] = await Promise.all([
    db.collection('agentwallets').findOne({ agentId }),
    db
      .collection('reptransactions')
      .find({ repId: agentId })
      .sort({ createdAt: -1 })
      .limit(LIST_LIMIT)
      .toArray(),
    db
      .collection('agentwithdrawals')
      .find({ agentId })
      .sort({ createdAt: -1 })
      .limit(LIST_LIMIT)
      .toArray(),
    db
      .collection('harxcommissions')
      .find({ agentId: agentIdStr })
      .sort({ createdAt: -1 })
      .limit(LIST_LIMIT)
      .toArray(),
  ]);

  const totals = transactions.reduce(
    (acc, row) => {
      acc.gross += row.amount || 0;
      acc.repShare += row.repShare || 0;
      acc.harxShare += row.harxShare || 0;
      return acc;
    },
    { gross: 0, repShare: 0, harxShare: 0 },
  );

  return serialize({
    wallet,
    transactions,
    withdrawals,
    harxCommissions,
    totals,
  });
}

async function loadCompanyFinancials(db, company) {
  const companyId = company._id;
  const companyIdStr = String(companyId);

  const [
    wallet,
    minutes,
    tokens,
    tokenUsage,
    walletEntries,
    payments,
    phoneNumbers,
    phoneNumberPayments,
    subscriptions,
    escrowWallet,
    repTransactions,
    harxCommissions,
    gigsCount,
  ] = await Promise.all([
    db.collection('walletcompanies').findOne({ companyId }),
    db.collection('minutescompanies').findOne({ companyId }),
    db.collection('tokenscompanies').findOne({ companyId }),
    db
      .collection('tokensusageledgers')
      .find({ companyId })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray(),
    db
      .collection('walletcompanyentries')
      .find({ companyId })
      .sort({ createdAt: -1 })
      .limit(LIST_LIMIT)
      .toArray(),
    db
      .collection('companypayments')
      .find({ companyId })
      .sort({ createdAt: -1 })
      .limit(LIST_LIMIT)
      .toArray(),
    db
      .collection('phonenumbers')
      .find({ companyId })
      .sort({ createdAt: -1 })
      .limit(LIST_LIMIT)
      .toArray(),
    db
      .collection('phonenumberpayments')
      .find({ companyId })
      .sort({ createdAt: -1 })
      .limit(LIST_LIMIT)
      .toArray(),
    db
      .collection('subscriptions')
      .find({ companyId: companyIdStr })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray(),
    db.collection('escrowwallets').findOne({ companyId }),
    db
      .collection('reptransactions')
      .find({ companyId })
      .sort({ createdAt: -1 })
      .limit(LIST_LIMIT)
      .toArray(),
    db
      .collection('harxcommissions')
      .find({ companyId: companyIdStr })
      .sort({ createdAt: -1 })
      .limit(LIST_LIMIT)
      .toArray(),
    db.collection('gigs').countDocuments({ companyId }),
  ]);

  const commissionTotals = harxCommissions.reduce(
    (sum, row) => sum + (row.amount || 0),
    0,
  );
  const repTotals = repTransactions.reduce(
    (acc, row) => {
      acc.gross += row.amount || 0;
      acc.repShare += row.repShare || 0;
      acc.harxShare += row.harxShare || 0;
      return acc;
    },
    { gross: 0, repShare: 0, harxShare: 0 },
  );

  const usageByProviderRows = await db
    .collection('tokensusageledgers')
    .aggregate([
      { $match: { companyId } },
      {
        $group: {
          _id: { $ifNull: ['$provider', 'unknown'] },
          tokensUsed: { $sum: '$tokensUsed' },
          requests: { $sum: 1 },
          inputTokens: { $sum: { $ifNull: ['$inputTokens', 0] } },
          outputTokens: { $sum: { $ifNull: ['$outputTokens', 0] } },
          lastUsedAt: { $max: '$createdAt' },
        },
      },
      { $sort: { tokensUsed: -1 } },
    ])
    .toArray();

  const emptyProviderStats = () => ({
    tokensUsed: 0,
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    lastUsedAt: null,
  });

  const tokenUsageByProvider = {
    openai: emptyProviderStats(),
    anthropic: emptyProviderStats(),
    gemini: emptyProviderStats(),
    estimated: emptyProviderStats(),
    other: emptyProviderStats(),
    total: emptyProviderStats(),
  };

  for (const row of usageByProviderRows) {
    const raw = String(row._id || 'unknown').toLowerCase();
    let key = 'other';
    if (raw === 'openai') key = 'openai';
    else if (raw === 'anthropic' || raw === 'claude') key = 'anthropic';
    else if (raw === 'gemini' || raw === 'google') key = 'gemini';
    else if (raw === 'estimated') key = 'estimated';

    const stats = {
      tokensUsed: row.tokensUsed || 0,
      requests: row.requests || 0,
      inputTokens: row.inputTokens || 0,
      outputTokens: row.outputTokens || 0,
      lastUsedAt: row.lastUsedAt || null,
    };
    tokenUsageByProvider[key] = stats;
    tokenUsageByProvider.total.tokensUsed += stats.tokensUsed;
    tokenUsageByProvider.total.requests += stats.requests;
    tokenUsageByProvider.total.inputTokens += stats.inputTokens;
    tokenUsageByProvider.total.outputTokens += stats.outputTokens;
    if (
      stats.lastUsedAt &&
      (!tokenUsageByProvider.total.lastUsedAt ||
        new Date(stats.lastUsedAt) > new Date(tokenUsageByProvider.total.lastUsedAt))
    ) {
      tokenUsageByProvider.total.lastUsedAt = stats.lastUsedAt;
    }
  }

  return serialize({
    wallet,
    minutes,
    tokens: tokens
      ? tokens
      : {
          tokens: 0,
          purchasedTokens: 0,
          consumedTokens: 0,
        },
    tokenUsage,
    tokenUsageByProvider,
    walletEntries,
    payments,
    phoneNumbers,
    phoneNumberPayments,
    subscriptions,
    escrowWallet,
    repTransactions,
    harxCommissions,
    gigsCount,
    totals: {
      harxCommissions: commissionTotals,
      repActivity: repTotals,
    },
  });
}

export async function getUserDetail(userId) {
  const user = await User.findById(userId)
    .select('-password -verificationCode')
    .lean();

  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const db = mongoose.connection.db;
  const userObjectId = oid(userId);
  const detail = {
    user: sanitizeUser(user),
    onboarding: null,
    profile: null,
    financials: null,
    platform: null,
  };

  const harxWallet = await db.collection('harxwallets').findOne({});
  detail.platform = serialize({
    harxWallet,
  });

  if (user.typeUser === 'rep') {
    const agent = await db.collection('agents').findOne({ userId: userObjectId });
    const populatedAgent = agent ? await populateAgentForAdmin(db, agent) : null;
    const enrichedAgent = populatedAgent ? await enrichAgentMedia(populatedAgent) : null;
    detail.onboarding = formatRepOnboarding(agent);
    detail.profile = {
      type: 'rep',
      agent: sanitizeAgent(enrichedAgent),
      agentId: agent ? String(agent._id) : null,
    };
    if (agent) {
      detail.financials = await loadRepFinancials(db, agent);
    }
  } else if (user.typeUser === 'company') {
    const company = await db.collection('companies').findOne({ userId: userObjectId });
    const populatedCompany = company ? await populateCompanyForAdmin(db, company) : null;
    const onboardingDoc = company
      ? await db.collection('onboardingprogresses').findOne({ companyId: company._id })
      : null;

    detail.onboarding = formatCompanyOnboarding(company, onboardingDoc);
    detail.profile = {
      type: 'company',
      company: sanitizeCompany(populatedCompany),
      companyId: company ? String(company._id) : null,
      onboardingProgress: serialize(onboardingDoc),
    };
    if (company) {
      detail.financials = await loadCompanyFinancials(db, company);
    }
  }

  return detail;
}

async function ensureCompany(db, userId) {
  const company = await db.collection('companies').findOne({ userId: oid(userId) });
  if (!company) {
    const error = new Error('Company profile not found');
    error.statusCode = 404;
    throw error;
  }
  return company;
}

async function ensureAgent(db, userId) {
  const agent = await db.collection('agents').findOne({ userId: oid(userId) });
  if (!agent) {
    const error = new Error('Rep profile not found');
    error.statusCode = 404;
    throw error;
  }
  return agent;
}

async function adjustCompanyMinutes(db, companyId, action, amount) {
  let minutesDoc = await db.collection('minutescompanies').findOne({ companyId });
  if (!minutesDoc) {
    const now = new Date();
    await db.collection('minutescompanies').insertOne({
      companyId,
      minutes: 0,
      purchasedMinutes: 0,
      consumedSeconds: 0,
      chargedCallSids: [],
      createdAt: now,
      updatedAt: now,
    });
    minutesDoc = await db.collection('minutescompanies').findOne({ companyId });
  }

  const current = minutesDoc.minutes || 0;
  const newMinutes = action === 'set' ? amount : current + amount;

  await db.collection('minutescompanies').updateOne(
    { _id: minutesDoc._id },
    {
      $set: { minutes: newMinutes, updatedAt: new Date() },
      ...(action === 'add' && amount > 0
        ? { $inc: { purchasedMinutes: amount } }
        : {}),
    },
  );

  return { minutes: newMinutes };
}

async function ensureTokensCompany(db, companyId) {
  let tokensDoc = await db.collection('tokenscompanies').findOne({ companyId });
  if (!tokensDoc) {
    const now = new Date();
    await db.collection('tokenscompanies').insertOne({
      companyId,
      tokens: 0,
      purchasedTokens: 0,
      consumedTokens: 0,
      chargedUsageIds: [],
      aiProviders: { openai: true, anthropic: true, gemini: true },
      createdAt: now,
      updatedAt: now,
    });
    tokensDoc = await db.collection('tokenscompanies').findOne({ companyId });
  }
  return tokensDoc;
}

async function adjustCompanyAiTokens(db, companyId, action, amount) {
  const tokensDoc = await ensureTokensCompany(db, companyId);
  const current = tokensDoc.tokens || 0;
  const delta = Math.round(Number(amount));
  const newTokens = action === 'set' ? Math.round(Number(amount)) : current + delta;

  if (newTokens < 0) {
    const error = new Error('AI tokens balance cannot be negative');
    error.statusCode = 400;
    throw error;
  }

  const incPurchased =
    action === 'add' && delta > 0
      ? { $inc: { purchasedTokens: delta } }
      : {};

  await db.collection('tokenscompanies').updateOne(
    { _id: tokensDoc._id },
    {
      $set: { tokens: newTokens, updatedAt: new Date() },
      ...incPurchased,
    },
  );

  return {
    tokens: newTokens,
    purchasedTokens:
      action === 'add' && delta > 0
        ? (tokensDoc.purchasedTokens || 0) + delta
        : tokensDoc.purchasedTokens || 0,
    consumedTokens: tokensDoc.consumedTokens || 0,
  };
}

async function updateCompanyAiProviders(db, companyId, providers = {}) {
  const tokensDoc = await ensureTokensCompany(db, companyId);
  const next = {
    openai: providers.openai !== false,
    anthropic: providers.anthropic !== false,
    gemini: providers.gemini !== false,
  };

  await db.collection('tokenscompanies').updateOne(
    { _id: tokensDoc._id },
    { $set: { aiProviders: next, updatedAt: new Date() } },
  );

  return { aiProviders: next };
}

async function adjustCompanyWallet(db, companyId, action, amount, reason) {
  let wallet = await db.collection('walletcompanies').findOne({ companyId });
  if (!wallet) {
    const now = new Date();
    await db.collection('walletcompanies').insertOne({
      companyId,
      balance: 0,
      createdAt: now,
      updatedAt: now,
    });
    wallet = await db.collection('walletcompanies').findOne({ companyId });
  }

  const current = wallet.balance || 0;
  const newBalance = action === 'set' ? amount : current + amount;
  if (newBalance < 0) {
    const error = new Error('Balance cannot be negative');
    error.statusCode = 400;
    throw error;
  }

  const delta = Math.abs(newBalance - current);
  const direction = newBalance >= current ? 'credit' : 'debit';

  await db.collection('walletcompanies').updateOne(
    { _id: wallet._id },
    { $set: { balance: newBalance, updatedAt: new Date() } },
  );

  if (delta > 0) {
    await db.collection('walletcompanyentries').insertOne({
      companyId,
      type: 'adjustment',
      direction,
      amount: delta,
      currency: 'EUR',
      balanceAfter: newBalance,
      status: 'completed',
      description: reason || 'Ajustement admin HARX',
      meta: { source: 'admin' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return { balance: newBalance };
}

async function adjustRepWallet(db, agentId, action, amount) {
  const wallet = await db.collection('agentwallets').findOne({ agentId });
  if (!wallet) {
    const error = new Error('Rep wallet not found');
    error.statusCode = 404;
    throw error;
  }

  const current = wallet.availableBalance || 0;
  const newBalance = action === 'set' ? amount : current + amount;
  if (newBalance < 0) {
    const error = new Error('Balance cannot be negative');
    error.statusCode = 400;
    throw error;
  }

  await db.collection('agentwallets').updateOne(
    { _id: wallet._id },
    { $set: { availableBalance: newBalance, updatedAt: new Date() } },
  );

  return { availableBalance: newBalance };
}

export async function updateUserFinancials(userId, payload = {}) {
  const { target, action = 'add', amount, reason, providers, aiProviders } = payload;
  const numericAmount = Number(amount);

  if (!target) {
    const error = new Error('Invalid financial update payload');
    error.statusCode = 400;
    throw error;
  }

  const db = mongoose.connection.db;

  if (target === 'company_ai_providers') {
    const company = await ensureCompany(db, userId);
    return updateCompanyAiProviders(db, company._id, providers || aiProviders || {});
  }

  if (Number.isNaN(numericAmount)) {
    const error = new Error('Invalid financial update payload');
    error.statusCode = 400;
    throw error;
  }

  if (!['set', 'add'].includes(action)) {
    const error = new Error('Action must be set or add');
    error.statusCode = 400;
    throw error;
  }

  if (target === 'company_minutes') {
    const company = await ensureCompany(db, userId);
    return adjustCompanyMinutes(db, company._id, action, numericAmount);
  }

  if (target === 'company_wallet') {
    const company = await ensureCompany(db, userId);
    return adjustCompanyWallet(db, company._id, action, numericAmount, reason);
  }

  if (target === 'company_ai_tokens') {
    const company = await ensureCompany(db, userId);
    return adjustCompanyAiTokens(db, company._id, action, numericAmount);
  }

  if (target === 'rep_wallet') {
    const agent = await ensureAgent(db, userId);
    return adjustRepWallet(db, agent._id, action, numericAmount);
  }

  const error = new Error('Unknown financial target');
  error.statusCode = 400;
  throw error;
}
