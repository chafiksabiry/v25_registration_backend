import mongoose from 'mongoose';
import User from '../models/User.js';
import CompanyMembership from '../models/CompanyMembership.js';
import CallCenterWorkspaceState from '../models/CallCenterWorkspaceState.js';
import { hasEmployment } from '../utils/employments.js';
import { normalizeContactInput } from './callCenterCompanyProfileValidation.js';
import { normalizeWorkspaceInput, writableParts } from './callCenterWorkspaceStateValidation.js';

function fail(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const isId = (v) => mongoose.Types.ObjectId.isValid(String(v || ''));

/** Le propriétaire de la société, une personne membre de son équipe, ou un agent qu'elle emploie ; renvoie 'owner', 'member' ou 'agent'. */
async function resolveAccess(callerUserId, companyId) {
  if (!callerUserId || !isId(callerUserId)) throw fail(401, 'Authentication required');
  if (!isId(companyId)) throw fail(400, 'Valid companyId is required');
  const caller = await User.findById(callerUserId);
  if (!caller) throw fail(401, 'Caller not found');
  const company = await mongoose.connection.db.collection('companies').findOne({ _id: oid(companyId) });
  if (!company) throw fail(404, 'Company not found');
  if (String(company.userId) === String(callerUserId)) return 'owner';
  if (hasEmployment(caller, companyId)) return 'agent';
  const member = await CompanyMembership.findOne({ companyId: oid(companyId), userId: oid(callerUserId) }).select('_id').lean();
  if (!member) throw fail(403, 'You do not belong to this company');
  return 'member';
}

/** État du centre (partagé) et de la personne connectée ; objets vides tant que rien n'a été enregistré. */
export async function getWorkspaceState(callerUserId, companyId) {
  await resolveAccess(callerUserId, companyId);
  const [company, user] = await Promise.all([
    CallCenterWorkspaceState.findOne({ companyId: oid(companyId), scope: 'company', userId: null }).lean(),
    CallCenterWorkspaceState.findOne({ companyId: oid(companyId), scope: 'user', userId: oid(callerUserId) }).lean(),
  ]);
  return { company: company?.data ?? {}, user: user?.data ?? {}, exists: { company: Boolean(company), user: Boolean(user) } };
}

/** Enregistre les clés reçues (les autres sont conservées) ; refuse tout le corps si une partie est invalide. */
export async function saveWorkspaceState(callerUserId, companyId, body) {
  const access = await resolveAccess(callerUserId, companyId);
  const { value: sent, errors } = normalizeWorkspaceInput(body);
  if (errors.length) throw fail(400, errors.join(' '));
  const value = writableParts(access, sent);
  const writes = [];
  const merge = (scope, userId, patch) => {
    const set = Object.fromEntries(Object.entries(patch).map(([k, v]) => [`data.${k}`, v]));
    if (!Object.keys(set).length) return;
    writes.push(CallCenterWorkspaceState.updateOne({ companyId: oid(companyId), scope, userId }, { $set: set }, { upsert: true }));
  };
  if (value.company) merge('company', null, value.company);
  if (value.user) merge('user', oid(callerUserId), value.user);
  await Promise.all(writes);
  return getWorkspaceState(callerUserId, companyId);
}

/**
 * Met à jour les seules coordonnées du profil (e-mail, téléphone, adresse) ; titulaire seulement. Le nom, le pays, l'identifiant
 * d'entreprise et les justificatifs ne sont jamais touchés. Renvoie les coordonnées enregistrées.
 */
export async function updateCompanyContact(callerUserId, companyId, body) {
  const access = await resolveAccess(callerUserId, companyId);
  if (access !== 'owner') throw fail(403, 'Seul le titulaire peut modifier le profil de l’entreprise.');
  const filter = { companyId: oid(companyId), scope: 'company', userId: null };
  const doc = await CallCenterWorkspaceState.findOne(filter).lean();
  const profile = doc?.data?.profile;
  if (!profile) throw fail(409, 'Le profil de l’entreprise n’est pas encore renseigné : terminez la mise en route.');
  const { value, errors } = normalizeContactInput(body, profile.country || 'FR');
  if (errors.length) throw fail(400, errors.join(' '));
  const set = Object.fromEntries(Object.entries(value).map(([k, v]) => [`data.profile.${k}`, v]));
  await CallCenterWorkspaceState.updateOne(filter, { $set: set });
  const next = { ...profile, ...value };
  return { representativeEmail: next.representativeEmail ?? '', phone: next.phone ?? '', address: next.address ?? null };
}
