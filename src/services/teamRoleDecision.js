/**
 * Une même adresse ne peut pas être, dans un même centre, à la fois membre de l'équipe (manager, administratif…) et agent.
 * `decideRoleConflict` est pur (testable sans base) ; `roleConflict` rassemble les faits depuis la base.
 */
export const MEMBER_CONFLICT_MESSAGE = 'Cette adresse est déjà invitée comme membre de votre équipe : elle ne peut pas l’être aussi comme agent.';
export const AGENT_CONFLICT_MESSAGE = 'Cette adresse est déjà invitée comme agent de votre centre : elle ne peut pas l’être aussi comme membre de l’équipe.';
export const OWNER_CONFLICT_MESSAGE = 'Cette adresse est celle du propriétaire du centre : elle ne peut pas être invitée comme agent.';

/** @returns {string|null} le message de refus, ou null si l'invitation est permise */
export function decideRoleConflict(wanted, facts) {
  if (wanted === 'agent') {
    if (facts.isOwner) return OWNER_CONFLICT_MESSAGE;
    if (facts.hasMembership || facts.memberInvitation) return MEMBER_CONFLICT_MESSAGE;
    return null;
  }
  if (facts.isAgent || facts.agentInvitation) return AGENT_CONFLICT_MESSAGE;
  return null;
}

