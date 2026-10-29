const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

/**
 * Ce qu'un centre voit d'une personne qui a déjà un compte HARX : ce qu'il a lui-même saisi (nom, téléphone), jamais
 * le profil du compte tant que la personne n'a pas accepté son invitation (un autre centre l'a peut-être nommée
 * autrement, et son téléphone n'a pas à lui être communiqué).
 */
export function serializeInvitedAccount(user, invitation) {
  const accepted = invitation.status === 'accepted';
  const typedName = String(invitation.fullName || '').trim();
  const typedPhone = String(invitation.phone || '').trim();
  const email = normalizeEmail(invitation.email || user.email);
  return {
    _id: user._id,
    fullName: typedName || (accepted ? String(user.fullName || '').trim() : '') || email.split('@')[0],
    email,
    phone: typedPhone || (accepted ? String(user.phone || '') : ''),
    typeUser: 'rep',
    employerCompanyId: accepted ? String(invitation.companyId) : null,
    mustChangePassword: false,
    invitationStatus: accepted ? 'active' : 'invited',
    invitedAt: invitation.invitedAt || null,
    isVerified: accepted ? Boolean(user.isVerified) : false,
    createdAt: invitation.createdAt || invitation.invitedAt || null,
    existingAccount: true,
  };
}
