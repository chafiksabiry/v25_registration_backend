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

export function formatRepOnboarding(agent) {
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

export function formatCompanyOnboarding(company, onboarding) {
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
