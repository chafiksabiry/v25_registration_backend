/**
 * Emplois d'un agent : un compte `rep` peut travailler pour PLUSIEURS centres (`User.employments`), un seul est actif à
 * la fois côté portail. Compatibilité : l'ancien champ mono-valué `employerCompanyId` reste le centre par défaut et
 * compte comme une entrée active de la liste tant qu'aucune entrée de la liste ne le contredit (migration paresseuse :
 * il n'est converti en entrée qu'à la première écriture, jamais par un script).
 */

const sid = (v) => (v === undefined || v === null || v === '' ? '' : String(v));

/** Entrées normalisées { companyId, status, startedAt, endedAt, legacy }, ancien employeur inclus. */
export function effectiveEmployments(user) {
  const list = (Array.isArray(user?.employments) ? user.employments : [])
    .filter((e) => e && sid(e.companyId))
    .map((e) => ({
      companyId: sid(e.companyId),
      status: e.status === 'ended' ? 'ended' : 'active',
      startedAt: e.startedAt || null,
      endedAt: e.endedAt || null,
      legacy: false,
    }));
  const legacy = sid(user?.employerCompanyId);
  if (legacy && !list.some((e) => e.companyId === legacy)) {
    list.unshift({ companyId: legacy, status: 'active', startedAt: user?.invitedAt || user?.createdAt || null, endedAt: null, legacy: true });
  }
  return list;
}

export function activeEmployments(user) {
  return effectiveEmployments(user).filter((e) => e.status === 'active');
}

/** Centre par défaut : l'ancien employeur s'il est encore actif, sinon le plus ancien emploi actif. */
export function defaultCompanyId(user) {
  const active = activeEmployments(user);
  if (!active.length) return null;
  const legacy = sid(user?.employerCompanyId);
  if (legacy && active.some((e) => e.companyId === legacy)) return legacy;
  return [...active].sort((a, b) => new Date(a.startedAt || 0) - new Date(b.startedAt || 0))[0].companyId;
}

/** Cette personne est-elle un agent employé (actif) par ce centre ? C'est LE contrôle d'accès serveur d'un agent. */
export function hasEmployment(user, companyId) {
  if (user?.typeUser !== 'rep') return false;
  const id = sid(companyId);
  return Boolean(id) && activeEmployments(user).some((e) => e.companyId === id);
}

/** Centre actif demandé s'il fait partie des emplois, sinon centre par défaut (jamais un centre étranger). */
export function resolveActiveCompanyId(user, requested) {
  return hasEmployment(user, requested) ? sid(requested) : defaultCompanyId(user);
}

/** Nouvelle liste d'emplois avec ce centre ajouté (ou ré-activé) ; les autres emplois restent intacts. */
export function withEmployment(user, companyId, now = new Date()) {
  const id = sid(companyId);
  const list = effectiveEmployments(user).map(({ legacy, ...e }) => e);
  const i = list.findIndex((e) => e.companyId === id);
  if (i >= 0) list[i] = list[i].status === 'active' ? list[i] : { companyId: id, status: 'active', startedAt: now, endedAt: null };
  else list.push({ companyId: id, status: 'active', startedAt: now, endedAt: null });
  const legacy = sid(user?.employerCompanyId);
  const legacyStillActive = legacy && list.some((e) => e.companyId === legacy && e.status === 'active');
  return { employments: list, employerCompanyId: legacyStillActive ? legacy : id };
}

/** Termine l'emploi dans CE centre uniquement ; le centre par défaut bascule sur un autre emploi actif s'il en reste. */
export function withoutEmployment(user, companyId, now = new Date()) {
  const id = sid(companyId);
  const list = effectiveEmployments(user).map(({ legacy, ...e }) => (e.companyId === id ? { ...e, status: 'ended', endedAt: now } : e));
  const next = defaultCompanyId({ ...user, employments: list, employerCompanyId: sid(user?.employerCompanyId) === id ? null : user?.employerCompanyId });
  return { employments: list, employerCompanyId: next };
}
