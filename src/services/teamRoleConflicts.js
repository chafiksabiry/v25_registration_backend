import User from '../models/User.js';
import AgentInvitation from '../models/AgentInvitation.js';
import CompanyMembership from '../models/CompanyMembership.js';

import { hasEmployment } from '../utils/employments.js';
import { decideRoleConflict } from './teamRoleDecision.js';

/** Un compte entreprise (société ou centre) ne peut jamais être agent ni membre d'une autre équipe. */
export const isCompanyAccount = (user) => Boolean(user && ['company', 'call-center'].includes(String(user.typeUser || '')));

export async function roleConflict(wanted, { company, companyId, email }) {
  const normalized = String(email || '').trim().toLowerCase();
  const user = await User.findOne({ email: normalized }).select('_id typeUser employerCompanyId employments');
  const invitations = await AgentInvitation.find({ companyId, email: normalized, status: { $ne: 'declined' } }).select('kind');
  const membership = await CompanyMembership.findOne({
    companyId,
    $or: [{ email: normalized }, ...(user ? [{ userId: user._id }] : [])],
  }).select('_id');
  return decideRoleConflict(wanted, {
    isOwner: Boolean(user && String(company.userId) === String(user._id)),
    isCompanyAccount: isCompanyAccount(user),
    hasMembership: Boolean(membership),
    memberInvitation: invitations.some((i) => i.kind === 'member'),
    isAgent: hasEmployment(user, companyId),
    agentInvitation: invitations.some((i) => i.kind !== 'member'),
  });
}
