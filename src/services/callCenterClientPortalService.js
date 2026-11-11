import crypto from 'crypto';
import mongoose from 'mongoose';
import User from '../models/User.js';
import CallCenterBranding from '../models/CallCenterBranding.js';
import CallCenterClientAccess from '../models/CallCenterClientAccess.js';
import CallCenterClient from '../models/CallCenterClient.js';
import CallCenterOperationClient from '../models/CallCenterOperationClient.js';
import { CLIENT_PORTAL_USER_TYPE, clientPermissions, emptyPermissions } from '../constants/companyPermissions.js';
import { clientPortalInvitationEmail } from '../utils/harxMessages.js';
import { appLoginUrl, sendAppEmail } from './brevoMail.js';
import { getCompanyProduct } from './companyProduct.js';
import { ownedClient, resolveOwnedCompany } from './callCenterClientService.js';
import { accessView, brandingView, normalizeBrandingInput, normalizeClientAccessInput } from './callCenterClientPortalValidation.js';

export const MULTI_CLIENTS_ONLY_MESSAGE = 'Le portail client est réservé à l’offre Contact centre multi-clients.';

function fail(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const isId = (v) => mongoose.Types.ObjectId.isValid(String(v || ''));

function tempPassword(length = 12) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%';
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
const companyLabel = (company) => company.name || company.companyName || company.title || '';

/** Palier multi-clients exigé côté serveur. Si l'abonnement est illisible, on refuse (fonction payante : pas d'accès par défaut). */
export async function isMultiClients(companyId) {
  try {
    return (await getCompanyProduct(companyId)) === 'multi_clients';
  } catch (error) {
    console.error('Portail client : abonnement illisible, accès refusé :', error?.message || error);
    return false;
  }
}
async function requireMultiClients(companyId) {
  if (!(await isMultiClients(companyId))) throw fail(403, MULTI_CLIENTS_ONLY_MESSAGE);
}

async function ownedAccess(companyId, userId) {
  if (!isId(userId)) throw fail(400, 'Valid userId is required');
  const access = await CallCenterClientAccess.findOne({ companyId: oid(companyId), userId: oid(userId) });
  if (!access) throw fail(404, 'Accès client introuvable');
  return access;
}

export async function getBranding(callerUserId, companyId) {
  const company = await resolveOwnedCompany(callerUserId, companyId);
  const doc = await CallCenterBranding.findOne({ companyId: oid(companyId) });
  return { ...brandingView(doc, ''), centerName: companyLabel(company), enabled: await isMultiClients(companyId) };
}

export async function setBranding(callerUserId, companyId, body) {
  const company = await resolveOwnedCompany(callerUserId, companyId);
  await requireMultiClients(companyId);
  const { errors, value } = normalizeBrandingInput(body);
  if (errors.length) throw fail(400, errors.join(' '));
  const doc = await CallCenterBranding.findOneAndUpdate({ companyId: oid(companyId) }, { $set: value }, { upsert: true, new: true, setDefaultsOnInsert: true });
  return { ...brandingView(doc, ''), centerName: companyLabel(company), enabled: true };
}

export async function listClientAccess(callerUserId, companyId, clientId) {
  await resolveOwnedCompany(callerUserId, companyId);
  const filter = { companyId: oid(companyId), ...(clientId && isId(clientId) ? { clientId: oid(clientId) } : {}) };
  const rows = await CallCenterClientAccess.find(filter).sort({ invitedAt: -1 });
  const users = await User.find({ _id: { $in: rows.map((r) => r.userId) } }).select('fullName');
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return rows.map((r) => accessView(r, byId.get(String(r.userId))));
}

async function sendInvitation({ company, client, user, password }) {
  const branding = await CallCenterBranding.findOne({ companyId: company._id });
  const message = clientPortalInvitationEmail({
    firstName: (user.fullName || '').trim().split(/\s+/)[0] || '',
    email: user.email,
    tempPassword: password,
    centerName: branding?.displayName || companyLabel(company),
    clientName: client.name,
    loginUrl: appLoginUrl(),
  });
  await sendAppEmail({ to: user.email, subject: message.subject, html: message.html });
}

/** Invite un contact d'un client : compte dédié (un compte = un client), accès en lecture seule, e-mail via le service existant. */
export async function inviteClientContact(callerUserId, companyId, body) {
  const company = await resolveOwnedCompany(callerUserId, companyId);
  await requireMultiClients(companyId);
  if (!isId(body?.clientId)) throw fail(400, 'Valid clientId is required');
  const client = await ownedClient(companyId, body.clientId);
  if (client.status === 'archived') throw fail(409, 'Ce client est archivé : rétablissez-le avant d’inviter un contact.');
  const { errors, value } = normalizeClientAccessInput(body);
  if (errors.length) throw fail(400, errors.join(' '));

  // Une adresse a au plus un compte HARX : un contact client reçoit un compte dédié, jamais un compte de centre,
  // d'agent ou de membre existant (il verrait sinon autre chose que ses opérations).
  const existing = await User.findOne({ email: value.email });
  if (existing) {
    const prior = await CallCenterClientAccess.findOne({ userId: existing._id });
    if (!prior) throw fail(409, 'Cette adresse correspond déjà à un compte HARX : invitez une autre adresse, dédiée au portail client.');
    if (String(prior.companyId) !== String(companyId) || String(prior.clientId) !== String(client._id)) {
      throw fail(409, 'Cette adresse a déjà un accès au portail d’un autre client.');
    }
    if (prior.status !== 'revoked') throw fail(409, 'Ce contact a déjà accès au portail.');
    prior.status = 'invited';
    prior.allowRecordings = value.allowRecordings;
    prior.invitedAt = new Date();
    prior.invitedBy = oid(callerUserId);
    await prior.save();
    const password = tempPassword();
    existing.password = password;
    existing.mustChangePassword = true;
    await existing.save();
    return finishInvite({ company, client, user: existing, access: prior, password });
  }

  const password = tempPassword();
  const user = new User({
    email: value.email,
    fullName: value.fullName || value.email.split('@')[0],
    phone: '',
    password,
    typeUser: CLIENT_PORTAL_USER_TYPE,
    product: 'callcentre',
    isVerified: true,
    firstTime: true,
    mustChangePassword: true,
    invitationStatus: 'pending',
    invitedByUserId: oid(callerUserId),
  });
  await user.save();
  const access = await CallCenterClientAccess.create({
    companyId: oid(companyId),
    clientId: client._id,
    userId: user._id,
    email: value.email,
    fullName: user.fullName,
    allowRecordings: value.allowRecordings,
    invitedBy: oid(callerUserId),
  });
  return finishInvite({ company, client, user, access, password });
}

async function finishInvite({ company, client, user, access, password }) {
  let emailSent = false;
  let emailError = null;
  try {
    await sendInvitation({ company, client, user, password });
    emailSent = true;
    user.invitationStatus = 'invited';
    user.invitedAt = new Date();
    await user.save();
  } catch (e) {
    emailError = e.message || 'Failed to send invitation email';
  }
  return { access: accessView(access, user), emailSent, emailError, temporaryPassword: emailSent ? undefined : password };
}

export async function resendClientInvitation(callerUserId, companyId, userId) {
  const company = await resolveOwnedCompany(callerUserId, companyId);
  await requireMultiClients(companyId);
  const access = await ownedAccess(companyId, userId);
  if (access.status !== 'invited') throw fail(409, 'Ce contact s’est déjà connecté ou n’a plus d’accès.');
  const client = await ownedClient(companyId, access.clientId);
  const user = await User.findById(access.userId);
  if (!user) throw fail(404, 'Compte introuvable');
  const password = tempPassword();
  user.password = password;
  user.mustChangePassword = true;
  await user.save();
  return finishInvite({ company, client, user, access, password });
}

export async function updateClientAccess(callerUserId, companyId, userId, body) {
  await resolveOwnedCompany(callerUserId, companyId);
  await requireMultiClients(companyId);
  const access = await ownedAccess(companyId, userId);
  const { errors, value } = normalizeClientAccessInput(body, { partial: true });
  if (errors.length) throw fail(400, errors.join(' '));
  if ('allowRecordings' in value) access.allowRecordings = value.allowRecordings;
  await access.save();
  return accessView(access);
}

/** Retire l'accès : la prochaine lecture de la session du contact ne donne plus rien (le compte reste, sans aucun droit). */
export async function revokeClientAccess(callerUserId, companyId, userId) {
  await resolveOwnedCompany(callerUserId, companyId);
  const access = await ownedAccess(companyId, userId);
  access.status = 'revoked';
  await access.save();
  return accessView(access);
}

/**
 * Session d'un compte « portail client » pour `GET /api/company-members/me`. Fermée par défaut : sans accès actif, client
 * archivé ou centre hors palier multi-clients, la personne n'a ni société, ni droit, ni opération. La société du centre
 * n'est volontairement PAS renvoyée en `companyId` (les autres services s'en servent pour ouvrir les données du centre) :
 * elle n'est pas non plus exposée dans `client` : le portail ne travaille que par les opérations (`gigIds`) de ce client.
 */
export async function clientPortalSession(caller) {
  const closed = (reason) => ({
    isOwner: false, isAgent: false, isClient: true, companyId: null,
    permissions: emptyPermissions(), preset: 'client', client: null, closedReason: reason,
  });
  const access = await CallCenterClientAccess.findOne({ userId: caller._id });
  if (!access || access.status === 'revoked') return closed('revoked');
  const company = await mongoose.connection.db.collection('companies').findOne({ _id: access.companyId });
  if (!company) return closed('revoked');
  if (!(await isMultiClients(access.companyId))) return closed('plan');
  const client = await CallCenterClient.findOne({ _id: access.clientId, companyId: access.companyId });
  if (!client || client.status === 'archived') return closed('client');
  if (access.status !== 'active') {
    access.status = 'active';
    access.connectedAt = access.connectedAt || new Date();
    await access.save();
    await User.updateOne({ _id: caller._id }, { $set: { invitationStatus: 'active' } });
  }
  const links = await CallCenterOperationClient.find({ companyId: access.companyId, clientId: access.clientId });
  const branding = await CallCenterBranding.findOne({ companyId: access.companyId });
  return {
    isOwner: false,
    isAgent: false,
    isClient: true,
    companyId: null,
    permissions: clientPermissions({ allowRecordings: access.allowRecordings }),
    preset: 'client',
    client: {
      id: String(client._id),
      name: client.name,
      allowRecordings: Boolean(access.allowRecordings),
      gigIds: links.map((l) => String(l.gigId)),
      branding: brandingView(branding, companyLabel(company)),
    },
  };
}
