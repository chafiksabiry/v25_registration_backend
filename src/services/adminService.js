import User from '../models/User.js';

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

export async function listUsers({ page = 1, limit = 25, search = '' } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const skip = (safePage - 1) * safeLimit;

  const filter = search
    ? {
        $or: [
          { email: { $regex: search, $options: 'i' } },
          { fullName: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .select('fullName email phone typeUser isVerified createdAt')
      .lean(),
    User.countDocuments(filter),
  ]);

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
