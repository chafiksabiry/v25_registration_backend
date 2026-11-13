import User from '../models/User.js';

/**
 * Acces MongoDB pour emailHistory. Uniquement des lectures et des $push / $set positionnel sur
 * `reengagement.emailHistory` : jamais d'upsert, de creation, de suppression ni de remplacement.
 */
const one = (docs) => (docs.length === 1 ? docs[0] : null); // 0 ou plusieurs correspondances : on n'ecrit pas

export const mongoEmailHistoryStore = {
  async findByEmail(email) {
    return one(await User.find({ email }).select('_id legacyV1.crmDealId').limit(2).lean());
  },
  async findByDealId(dealId) {
    return one(await User.find({ 'legacyV1.crmDealId': dealId }).select('_id legacyV1.crmDealId').limit(2).lean());
  },
  async pushEmail(userId, entry) {
    const result = await User.updateOne(
      { _id: userId, 'reengagement.emailHistory.zohoEmailId': { $ne: entry.zohoEmailId } },
      { $push: { 'reengagement.emailHistory': entry } }
    );
    return result.modifiedCount === 1;
  },
  async updateStatus(zohoEmailId, status, allowedPrevious) {
    const result = await User.updateOne(
      { 'reengagement.emailHistory': { $elemMatch: { zohoEmailId, status: { $in: allowedPrevious } } } },
      { $set: { 'reengagement.emailHistory.$.status': status } }
    );
    return result.modifiedCount === 1;
  },
  async findRecordedIds(zohoEmailIds) {
    const users = await User.find({ 'reengagement.emailHistory.zohoEmailId': { $in: zohoEmailIds } })
      .select('reengagement.emailHistory.zohoEmailId')
      .lean();
    const wanted = new Set(zohoEmailIds);
    const found = new Set();
    for (const user of users) {
      for (const item of user.reengagement?.emailHistory ?? []) {
        if (wanted.has(item.zohoEmailId)) found.add(item.zohoEmailId);
      }
    }
    return [...found];
  },
};
