import mongoose from 'mongoose';
import User from '../models/User.js';

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

export async function getWalletOverview() {
  const db = mongoose.connection.db;

  const [harxWallet, recentCommissions, users, companies, agents] = await Promise.all([
    db.collection('harxwallets').findOne({}),
    db.collection('harxcommissions').find({}).sort({ createdAt: -1 }).limit(30).toArray(),
    User.find({ typeUser: { $in: ['company', 'rep'] } })
      .select('fullName email typeUser')
      .sort({ fullName: 1 })
      .lean(),
    db.collection('companies').find({}).project({ userId: 1, name: 1, companyName: 1 }).toArray(),
    db.collection('agents').find({}).project({ userId: 1 }).toArray(),
  ]);

  const companyByUserId = new Map(companies.map((company) => [String(company.userId), company]));
  const agentByUserId = new Map(agents.map((agent) => [String(agent.userId), agent]));

  const companyIds = companies.map((company) => company._id);
  const agentIds = agents.map((agent) => agent._id);

  const [wallets, minutes, phoneCounts, agentWallets] = await Promise.all([
    companyIds.length
      ? db.collection('walletcompanies').find({ companyId: { $in: companyIds } }).toArray()
      : [],
    companyIds.length
      ? db.collection('minutescompanies').find({ companyId: { $in: companyIds } }).toArray()
      : [],
    companyIds.length
      ? db
          .collection('phonenumbers')
          .aggregate([
            { $match: { companyId: { $in: companyIds } } },
            { $group: { _id: '$companyId', count: { $sum: 1 } } },
          ])
          .toArray()
      : [],
    agentIds.length
      ? db.collection('agentwallets').find({ agentId: { $in: agentIds } }).toArray()
      : [],
  ]);

  const walletByCompanyId = new Map(wallets.map((wallet) => [String(wallet.companyId), wallet]));
  const minutesByCompanyId = new Map(minutes.map((entry) => [String(entry.companyId), entry]));
  const phoneCountByCompanyId = new Map(phoneCounts.map((row) => [String(row._id), row.count]));
  const agentWalletByAgentId = new Map(agentWallets.map((wallet) => [String(wallet.agentId), wallet]));

  const accounts = users.map((user) => {
    const account = {
      userId: String(user._id),
      fullName: user.fullName,
      email: user.email,
      typeUser: user.typeUser,
      companyName: undefined,
      summary: {},
    };

    if (user.typeUser === 'company') {
      const company = companyByUserId.get(String(user._id));
      if (company) {
        account.companyName = company.name || company.companyName;
        const companyId = String(company._id);
        account.summary = {
          walletBalance: walletByCompanyId.get(companyId)?.balance ?? 0,
          minutes: minutesByCompanyId.get(companyId)?.minutes ?? 0,
          phoneLines: phoneCountByCompanyId.get(companyId) ?? 0,
        };
      }
    } else if (user.typeUser === 'rep') {
      const agent = agentByUserId.get(String(user._id));
      if (agent) {
        const wallet = agentWalletByAgentId.get(String(agent._id));
        account.summary = {
          availableBalance: wallet?.availableBalance ?? 0,
          lifetimeEarnings: wallet?.lifetimeEarnings ?? 0,
        };
      }
    }

    return account;
  });

  return serialize({
    harxWallet,
    recentCommissions,
    accounts,
  });
}
