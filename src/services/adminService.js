import mongoose from 'mongoose';
import User from '../models/User.js';
import { formatCompanyOnboarding, formatRepOnboarding } from './adminOnboardingUtils.js';
import { loadAccountOffers } from './accountOffer.js';
import { isProtectedAccount } from './accountGate.js';

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

function resolveRepDisplayName(agent, user) {
  if (!agent?.personalInfo) return user.fullName;

  const { personalInfo } = agent;
  if (typeof personalInfo.name === 'string' && personalInfo.name.trim()) {
    return personalInfo.name.trim();
  }

  const fromParts = [personalInfo.firstName, personalInfo.lastName]
    .filter((part) => typeof part === 'string' && part.trim())
    .join(' ')
    .trim();
  if (fromParts) return fromParts;

  return user.fullName;
}

function applyRepProfileToUser(user, agent) {
  if (!agent) return user;

  const displayName = resolveRepDisplayName(agent, user);
  if (displayName === user.fullName) return user;

  return {
    ...user,
    displayName,
  };
}

/** Offre exposée à l'admin : offre (nomad / cloud / null = inconnue), produit CLOUD et d'où elle est lue. */
export function publicAccountOffer(resolved) {
  return {
    offer: resolved?.offer || null,
    product: resolved?.product || null,
    source: resolved?.source || null,
  };
}

/** Filtre « offre » de la liste : nomad, cloud, ou unknown (offre inconnue). Valeur invalide : pas de filtre. */
export const OFFER_FILTERS = ['nomad', 'cloud', 'unknown'];

export function matchesOfferFilter(user, offer) {
  if (!OFFER_FILTERS.includes(offer)) return true;
  const value = user.accountOffer?.offer || null;
  return offer === 'unknown' ? value === null : value === offer;
}

async function enrichUsersWithOnboarding(users) {
  if (!users.length) {
    return users;
  }

  const db = mongoose.connection.db;
  const userObjectIds = users.map((user) => new mongoose.Types.ObjectId(String(user._id)));

  const [agents, companies, companyProfiles, accountOffers] = await Promise.all([
    db
      .collection('agents')
      .find({ userId: { $in: userObjectIds } })
      .project({ userId: 1, onboardingProgress: 1, personalInfo: 1 })
      .toArray(),
    db.collection('companies').find({ userId: { $in: userObjectIds } }).project({ userId: 1 }).toArray(),
    loadCompanyProfilesForList(db, users),
    // Offre réelle (NOMAD / CLOUD + produit) : lectures groupées pour toute la page, pas une par compte.
    loadAccountOffers(db, users.map((user) => user._id)),
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
    let enriched = { ...user, accountOffer: publicAccountOffer(accountOffers.get(String(user._id))) };

    if (user.typeUser === 'rep') {
      const agent = agentByUserId.get(String(user._id));
      enriched.onboarding = formatRepOnboarding(agent);
      enriched = applyRepProfileToUser(enriched, agent);
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

/** Comptes protégés (démonstration Apple…) signalés à la liste : la console les rend non sélectionnables pour la suppression en masse. */
export const markProtected = (users) => users.map((user) => ({ ...user, protectedAccount: isProtectedAccount(user.email) }));

export async function listUsers({
  page = 1,
  limit = 25,
  search = '',
  typeUser = '',
  verified = '',
  onboardingStatus = '',
  planName = '',
  status = '',
  offer = '',
} = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const skip = (safePage - 1) * safeLimit;

  const filter = {};
  const allowedTypes = ['rep', 'company', 'admin', 'call-center'];
  const offerFilter = OFFER_FILTERS.includes(offer) ? offer : '';
  const postFilters = Boolean(onboardingStatus || planName || offerFilter);

  if (typeUser && allowedTypes.includes(typeUser)) {
    filter.typeUser = typeUser;
  }

  // Statut du compte (maquette A1) : actif / désactivé.
  if (status === 'disabled') {
    filter.disabled = true;
  } else if (status === 'active') {
    filter.disabled = { $ne: true };
  }

  if (verified === 'true') {
    filter.isVerified = true;
  } else if (verified === 'false') {
    filter.isVerified = false;
  }

  if (search) {
    const db = mongoose.connection.db;
    const [matchingCompanies, matchingAgents] = await Promise.all([
      db
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
        .toArray(),
      db
        .collection('agents')
        .find({
          $or: [
            { 'personalInfo.name': { $regex: search, $options: 'i' } },
            { 'personalInfo.firstName': { $regex: search, $options: 'i' } },
            { 'personalInfo.lastName': { $regex: search, $options: 'i' } },
            { 'personalInfo.email': { $regex: search, $options: 'i' } },
          ],
        })
        .project({ userId: 1 })
        .toArray(),
    ]);

    const companyUserIds = matchingCompanies
      .map((company) => company.userId)
      .filter((id) => id && mongoose.isValidObjectId(String(id)));
    const agentUserIds = matchingAgents
      .map((agent) => agent.userId)
      .filter((id) => id && mongoose.isValidObjectId(String(id)));

    filter.$or = [
      { email: { $regex: search, $options: 'i' } },
      { fullName: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      ...(companyUserIds.length ? [{ _id: { $in: companyUserIds } }] : []),
      ...(agentUserIds.length ? [{ _id: { $in: agentUserIds } }] : []),
    ];
  }

  if (postFilters) {
    const rawUsers = await User.find(filter)
      .sort({ createdAt: -1 })
      .select('fullName email phone typeUser isVerified createdAt disabled disabledAt')
      .lean();
    let users = await enrichUsersWithOnboarding(rawUsers);

    if (onboardingStatus) {
      users = users.filter((user) => user.onboarding?.phaseStatus === onboardingStatus);
    }
    if (planName) {
      const normalizedPlan = String(planName).trim().toLowerCase();
      users = users.filter((user) => (user.planName || '').toLowerCase() === normalizedPlan);
    }
    if (offerFilter) {
      users = users.filter((user) => matchesOfferFilter(user, offerFilter));
    }

    const total = users.length;
    const paginated = users.slice(skip, skip + safeLimit);

    return {
      users: markProtected(paginated),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        pages: Math.ceil(total / safeLimit) || 1,
      },
    };
  }

  const [rawUsers, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .select('fullName email phone typeUser isVerified createdAt disabled disabledAt')
      .lean(),
    User.countDocuments(filter),
  ]);

  const users = await enrichUsersWithOnboarding(rawUsers);

  return {
    users: markProtected(users),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit) || 1,
    },
  };
}
