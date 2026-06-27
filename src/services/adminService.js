import mongoose from 'mongoose';
import User from '../models/User.js';
import { formatCompanyOnboarding, formatRepOnboarding } from './adminOnboardingUtils.js';

async function enrichUsersWithOnboarding(users) {
  if (!users.length) {
    return users;
  }

  const db = mongoose.connection.db;
  const userObjectIds = users.map((user) => new mongoose.Types.ObjectId(String(user._id)));

  const [agents, companies] = await Promise.all([
    db
      .collection('agents')
      .find({ userId: { $in: userObjectIds } })
      .project({ userId: 1, onboardingProgress: 1 })
      .toArray(),
    db.collection('companies').find({ userId: { $in: userObjectIds } }).project({ userId: 1 }).toArray(),
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
    const enriched = { ...user };

    if (user.typeUser === 'rep') {
      enriched.onboarding = formatRepOnboarding(agentByUserId.get(String(user._id)));
    } else if (user.typeUser === 'company') {
      const company = companyByUserId.get(String(user._id));
      const onboarding = company ? onboardingByCompanyId.get(String(company._id)) : null;
      enriched.onboarding = formatCompanyOnboarding(company, onboarding);
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
    filter.$or = [
      { email: { $regex: search, $options: 'i' } },
      { fullName: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
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
