import mongoose from 'mongoose';
import User from '../models/User.js';

const REP_PHASE_LABELS = {
  1: 'Inscription & vérification',
  2: 'Profil REP',
  3: 'Évaluations',
  4: 'Abonnement',
  5: 'Marketplace / Gigs',
};

const COMPANY_PHASE_LABELS = {
  1: 'Compte & identité',
  2: 'Configuration opérationnelle',
  3: 'Engagement REPs',
  4: 'Activation',
};

const STATUS_LABELS = {
  not_started: 'Non démarré',
  in_progress: 'En cours',
  completed: 'Terminé',
  pending: 'En attente',
  missing: 'Profil absent',
};

function formatRepOnboarding(agent) {
  if (!agent?.onboardingProgress) {
    return {
      phase: null,
      phaseLabel: null,
      phaseStatus: 'missing',
      display: agent ? 'Profil REP incomplet' : 'Pas de profil REP',
      statusLabel: STATUS_LABELS.missing,
    };
  }

  const { phases = {}, currentPhase = 1 } = agent.onboardingProgress;
  const allCompleted = [1, 2, 3, 4, 5].every((n) => phases[`phase${n}`]?.status === 'completed');

  if (allCompleted) {
    return {
      phase: 5,
      phaseLabel: REP_PHASE_LABELS[5],
      phaseStatus: 'completed',
      display: 'Onboarding terminé',
      statusLabel: STATUS_LABELS.completed,
    };
  }

  let activePhase = currentPhase;
  let status = phases[`phase${activePhase}`]?.status || 'not_started';

  if (status === 'completed') {
    for (let phase = 1; phase <= 5; phase += 1) {
      const phaseStatus = phases[`phase${phase}`]?.status;
      if (phaseStatus !== 'completed') {
        activePhase = phase;
        status = phaseStatus || 'not_started';
        break;
      }
    }
  }

  const label = REP_PHASE_LABELS[activePhase] || `Phase ${activePhase}`;
  return {
    phase: activePhase,
    phaseLabel: label,
    phaseStatus: status,
    display: `Phase ${activePhase}/5 — ${label}`,
    statusLabel: STATUS_LABELS[status] || status,
  };
}

function formatCompanyOnboarding(company, onboarding) {
  if (!company) {
    return {
      phase: null,
      phaseLabel: null,
      phaseStatus: 'missing',
      display: 'Pas de profil entreprise',
      statusLabel: STATUS_LABELS.missing,
    };
  }

  if (!onboarding) {
    return {
      phase: 1,
      phaseLabel: COMPANY_PHASE_LABELS[1],
      phaseStatus: 'pending',
      display: 'Phase 1/4 — Compte & identité',
      statusLabel: STATUS_LABELS.pending,
    };
  }

  const phases = onboarding.phases || [];
  if (phases.length > 0 && phases.every((phase) => phase.status === 'completed')) {
    return {
      phase: 4,
      phaseLabel: COMPANY_PHASE_LABELS[4],
      phaseStatus: 'completed',
      display: 'Onboarding terminé',
      statusLabel: STATUS_LABELS.completed,
    };
  }

  const currentPhase = onboarding.currentPhase || 1;
  const activeEntry =
    phases.find((phase) => phase.id === currentPhase) ||
    phases.find((phase) => phase.status !== 'completed') ||
    phases[0];

  const activePhase = activeEntry?.id || currentPhase;
  const status = activeEntry?.status || 'pending';
  const label = COMPANY_PHASE_LABELS[activePhase] || `Phase ${activePhase}`;

  return {
    phase: activePhase,
    phaseLabel: label,
    phaseStatus: status,
    display: `Phase ${activePhase}/4 — ${label}`,
    statusLabel: STATUS_LABELS[status] || status,
  };
}

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
