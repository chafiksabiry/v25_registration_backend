import mongoose from 'mongoose';

/**
 * List rep onboarding satisfaction feedback from the agents collection.
 */
export async function listOnboardingSatisfaction({
  page = 1,
  limit = 50,
  search = '',
  scoredOnly = false,
} = {}) {
  const db = mongoose.connection.db;
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const skip = (safePage - 1) * safeLimit;

  const filter = {
    'onboardingSatisfaction.done': true,
  };

  if (scoredOnly === true || scoredOnly === 'true') {
    filter['onboardingSatisfaction.score'] = { $gte: 1, $lte: 5 };
  }

  if (search) {
    filter.$or = [
      { 'personalInfo.name': { $regex: search, $options: 'i' } },
      { 'personalInfo.firstName': { $regex: search, $options: 'i' } },
      { 'personalInfo.lastName': { $regex: search, $options: 'i' } },
      { 'personalInfo.email': { $regex: search, $options: 'i' } },
      { 'onboardingSatisfaction.comment': { $regex: search, $options: 'i' } },
    ];
  }

  const [total, agents] = await Promise.all([
    db.collection('agents').countDocuments(filter),
    db
      .collection('agents')
      .find(filter)
      .project({
        userId: 1,
        personalInfo: 1,
        status: 1,
        onboardingSatisfaction: 1,
        createdAt: 1,
      })
      .sort({ 'onboardingSatisfaction.submittedAt': -1 })
      .skip(skip)
      .limit(safeLimit)
      .toArray(),
  ]);

  const userIds = agents
    .map((a) => a.userId)
    .filter((id) => id && mongoose.isValidObjectId(String(id)))
    .map((id) => new mongoose.Types.ObjectId(String(id)));

  const users = userIds.length
    ? await db
        .collection('users')
        .find({ _id: { $in: userIds } })
        .project({ email: 1, fullName: 1 })
        .toArray()
    : [];
  const userById = new Map(users.map((u) => [String(u._id), u]));

  const items = agents.map((agent) => {
    const sat = agent.onboardingSatisfaction || {};
    const user = agent.userId ? userById.get(String(agent.userId)) : null;
    const name =
      agent.personalInfo?.name ||
      [agent.personalInfo?.firstName, agent.personalInfo?.lastName].filter(Boolean).join(' ') ||
      user?.fullName ||
      '—';
    const email = agent.personalInfo?.email || user?.email || '—';

    return {
      agentId: String(agent._id),
      userId: agent.userId ? String(agent.userId) : null,
      name,
      email,
      profileStatus: agent.status || null,
      score: sat.score ?? null,
      comment: sat.comment || '',
      skipped: Boolean(sat.skipped),
      submittedAt: sat.submittedAt
        ? new Date(sat.submittedAt).toISOString()
        : null,
    };
  });

  const scored = items.filter((i) => typeof i.score === 'number');
  const avgScore =
    scored.length > 0
      ? Math.round((scored.reduce((sum, i) => sum + i.score, 0) / scored.length) * 10) / 10
      : null;

  return {
    items,
    summary: {
      total,
      withScore: scored.length,
      averageScore: avgScore,
    },
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit) || 1,
    },
  };
}
