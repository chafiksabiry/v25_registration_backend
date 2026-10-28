import User from '../models/User.js';
import AgentInvitation from '../models/AgentInvitation.js';
import CompanyMembership from '../models/CompanyMembership.js';

import { decideRoleConflict } from './teamRoleDecision.js';

export async function roleConflict(wanted, { company, companyId, email }) {
  const normalized = String(email || '').trim().toLowerCase();
  const user = await User.findOne({ email: normalized }).select('_id typeUser employerCompanyId');
  const invitations = await AgentInvitation.find({ companyId, email: normalized, status: { $ne: 'declined' } }).select('kind');
  const membership = await CompanyMembership.findOne({
    companyId,
    $or: [{ email: normalized }, ...(user ? [{ userId: user._id }] : [])],
  }).select('_id');
  return decideRoleConflict(wanted, {
    isOwner: Boolean(user && String(company.userId) === String(user._id)),
    hasMembership: Boolean(membership),
    memberInvitation: invitations.some((i) => i.kind === 'member'),
    isAgent: Boolean(user && user.typeUser === 'rep' && user.employerCompanyId && String(user.employerCompanyId) === String(companyId)),
    agentInvitation: invitations.some((i) => i.kind !== 'member'),
  });
}
