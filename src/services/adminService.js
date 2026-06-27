import mongoose from 'mongoose';
import User from '../models/User.js';
import { formatCompanyOnboarding, formatRepOnboarding } from './adminOnboardingUtils.js';

async function loadCompanyProfilesForList(db, users) {
  const companyUserIds = users
    .filter((user) => user.typeUser === 'company')
    .map((user) => new mongoose.Types.ObjectId(String(user._id)));

  if (!companyUserIds.length) return new Map();

  const companies = await db
    .collection('companies')
    .find({ userId: { $in: companyUserIds } })
    .toArray();

  if (!companies.length) return new Map();

  const companyKeys = companies.flatMap((company) => [String(company._id), company._id]);
  const subscriptions = await db
    .collection('subscriptions')
    .find({ companyId: { $in: companyKeys } })
    .sort({ createdAt: -1 })
    .toArray();

  const subByCompanyId = new Map();
  subscriptions.forEach((sub) => {
    const key = String(sub.companyId);
    if (!subByCompanyId.has(key)) subByCompanyId.set(key, sub);
  });

  const planIdSet = new Set();
  companies.forEach((company) => {
    if (company.planId) planIdSet.add(String(company.planId));
    const sub = subByCompanyId.get(String(company._id));
    if (sub?.planId) planIdSet.add(String(sub.planId));
  });

  const planObjectIds = [...planIdSet]
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const planDocs = planObjectIds.length
    ? await db.collection('subscriptionplans').find({ _id: { $in: planObjectIds } }).toArray()
    : [];
  const planById = new Map(planDocs.map((plan) => [String(plan._id), plan]));

  const profiles = new Map();
  companies.forEach((company) => {
    const sub = subByCompanyId.get(String(company._id));
    const planRef = sub?.planId || company.planId;
    const planDoc = planRef ? planById.get(String(planRef)) : null;
    const tier = typeof company.subscription === 'string' ? company.subscription : null;

    profiles.set(String(company.userId), {
      companyId: String(company._id),
      name: company.name || null,
      industry: company.industry || null,
      email: company.contact?.email || null,
      phone: company.contact?.phone || null,
      planName: planDoc?.name || (tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : null),
      subscriptionStatus: sub?.status || null,
      createdAt: company.createdAt || null,
    });
  });

  return profiles;
}

function applyCompanyProfileToUser(user, companyProfile) {
  if (!companyProfile) return user;

  return {
    ...user,
    companyProfile,
    displayName: companyProfile.name || user.fullName,
    displayEmail: companyProfile.email || user.email,
    displayPhone: companyProfile.phone || user.phone,
    industry: companyProfile.industry || null,
    planName: companyProfile.planName || null,
    subscriptionStatus: companyProfile.subscriptionStatus || null,
    profileCreatedAt: companyProfile.createdAt || user.createdAt,
  };
}

async function enrichUsersWithOnboarding(users) {
  if (!users.length) {
    return users;
  }

  const db = mongoose.connection.db;
  const userObjectIds = users.map((user) => new mongoose.Types.ObjectId(String(user._id)));

  const [agents, companies, companyProfiles] = await Promise.all([
    db
      .collection('agents')
      .find({ userId: { $in: userObjectIds } })
      .project({ userId: 1, onboardingProgress: 1 })
      .toArray(),
    db.collection('companies').find({ userId: { $in: userObjectIds } }).project({ userId: 1 }).toArray(),
    loadCompanyProfilesForList(db, users),
  ]);

  const agentByUserId = new Map(agents.map((agent) => [String(agent.userId), agent]));
  const companyByUserId = new Map(companies.map((company) => [String(company.userId), company]));

  const companyIds = companies.map((company) => company._id);
  const onboardings = companyIds.length
    ? await db.collection('onboardingprogresses').find({ companyId: { $in: companyIds } }).toArray()
    : [];
  const onboardingByCompanyId = new Map(
    onboardings.map((entry) => [String(entry.companyId), entry]),
  );

  return users.map((user) => {
    let enriched = { ...user };

    if (user.typeUser === 'rep') {
      enriched.onboarding = formatRepOnboarding(agentByUserId.get(String(user._id)));
    } else if (user.typeUser === 'company') {
      const company = companyByUserId.get(String(user._id));
      const onboarding = company ? onboardingByCompanyId.get(String(company._id)) : null;
      enriched.onboarding = formatCompanyOnboarding(company, onboarding);
      enriched = applyCompanyProfileToUser(enriched, companyProfiles.get(String(user._id)));
    } else {
      enriched.onboarding = null;
    }

    return enriched;
  });
}

export async function getAdminStats() {
  const [totalUsers, verifiedUsers, companyUsers, repUsers, adminUsers] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ isVerified: true }),
    User.countDocuments({ typeUser: 'company' }),
    User.countDocuments({ typeUser: 'rep' }),
    User.countDocuments({ typeUser: 'admin' }),
  ]);

  const recentUsers = await User.find({})
    .sort({ createdAt: -1 })
    .limit(20)
    .select('fullName email phone typeUser isVerified createdAt')
    .lean();

  return {
    totals: {
      users: totalUsers,
      verified: verifiedUsers,
      company: companyUsers,
      rep: repUsers,
      admin: adminUsers,
      unassigned: totalUsers - companyUsers - repUsers - adminUsers,
    },
    recentUsers,
  };
}

export async function listUsers({ page = 1, limit = 25, search = '', typeUser = '' } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const skip = (safePage - 1) * safeLimit;

  const filter = {};
  const allowedTypes = ['rep', 'company', 'admin'];

  if (typeUser && allowedTypes.includes(typeUser)) {
    filter.typeUser = typeUser;
  }

  if (search) {
    const db = mongoose.connection.db;
    const matchingCompanies = await db
      .collection('companies')
      .find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { industry: { $regex: search, $options: 'i' } },
          { 'contact.email': { $regex: search, $options: 'i' } },
          { 'contact.phone': { $regex: search, $options: 'i' } },
        ],
      })
      .project({ userId: 1 })
      .toArray();

    const companyUserIds = matchingCompanies
      .map((company) => company.userId)
      .filter((id) => id && mongoose.isValidObjectId(String(id)));

    filter.$or = [
      { email: { $regex: search, $options: 'i' } },
      { fullName: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      ...(companyUserIds.length ? [{ _id: { $in: companyUserIds } }] : []),
    ];
  }

  const [rawUsers, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .select('fullName email phone typeUser isVerified createdAt')
      .lean(),
    User.countDocuments(filter),
  ]);

  const users = await enrichUsersWithOnboarding(rawUsers);

  return {
    users,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit) || 1,
    },
  };
}
