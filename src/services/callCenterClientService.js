import mongoose from 'mongoose';
import User from '../models/User.js';
import CallCenterClient from '../models/CallCenterClient.js';
import CallCenterOperationClient from '../models/CallCenterOperationClient.js';
import CallCenterOperationProfile from '../models/CallCenterOperationProfile.js';
import { clientView, normalizeClientInput } from './callCenterClientValidation.js';
import { normalizeProfileInput, profileView } from './callCenterOperationProfileValidation.js';
import CallCenterOnboardingFeedback from '../models/CallCenterOnboardingFeedback.js';
import { normalizeFeedbackInput } from './callCenterOnboardingFeedbackValidation.js';

function fail(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const isId = (v) => mongoose.Types.ObjectId.isValid(String(v || ''));

/** Même contrôle d'appartenance que la gestion des agents : seul le propriétaire de la société agit sur ses clients. */
async function resolveOwnedCompany(callerUserId, companyId) {
  if (!callerUserId) throw fail(401, 'Authentication required');
  if (!isId(companyId)) throw fail(400, 'Valid companyId is required');
  const caller = await User.findById(callerUserId);
  if (!caller) throw fail(401, 'Caller not found');
  if (caller.typeUser !== 'call-center' && caller.typeUser !== 'company') {
    throw fail(403, 'Only call-center accounts can manage clients');
  }
  const company = await mongoose.connection.db.collection('companies').findOne({ _id: oid(companyId) });
  if (!company) throw fail(404, 'Company not found');
  if (String(company.userId) !== String(callerUserId)) throw fail(403, 'You do not own this company');
  return company;
}

async function ownedClient(companyId, id) {
  if (!isId(id)) throw fail(400, 'Valid client id is required');
  const client = await CallCenterClient.findOne({ _id: oid(id), companyId: oid(companyId) });
  if (!client) throw fail(404, 'Client not found');
  return client;
}

async function assertNameAvailable(companyId, name, exceptId) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const clash = await CallCenterClient.findOne({
    companyId: oid(companyId),
    name: new RegExp(`^${escaped}$`, 'i'),
    ...(exceptId ? { _id: { $ne: oid(exceptId) } } : {}),
  });
  if (clash) throw fail(409, 'Un client porte déjà ce nom.');
}

export async function listClients(callerUserId, companyId) {
  await resolveOwnedCompany(callerUserId, companyId);
  const rows = await CallCenterClient.find({ companyId: oid(companyId) }).sort({ name: 1 });
  return rows.map(clientView);
}

export async function createClient(callerUserId, companyId, body) {
  await resolveOwnedCompany(callerUserId, companyId);
  const { errors, value } = normalizeClientInput(body);
  if (errors.length) throw fail(400, errors.join(' '));
  await assertNameAvailable(companyId, value.name);
  const doc = await CallCenterClient.create({ ...value, companyId: oid(companyId), createdBy: oid(callerUserId) });
  return clientView(doc);
}

export async function updateClient(callerUserId, companyId, id, body) {
  await resolveOwnedCompany(callerUserId, companyId);
  const client = await ownedClient(companyId, id);
  const { errors, value } = normalizeClientInput(body, { partial: true });
  if (errors.length) throw fail(400, errors.join(' '));
  if (value.name && value.name.toLowerCase() !== client.name.toLowerCase()) await assertNameAvailable(companyId, value.name, id);
  client.set(value);
  await client.save();
  return clientView(client);
}

export async function setClientStatus(callerUserId, companyId, id, status) {
  await resolveOwnedCompany(callerUserId, companyId);
  const client = await ownedClient(companyId, id);
  client.status = status;
  await client.save();
  return clientView(client);
}

/** Suppression refusée tant que des opérations sont rattachées : on les rattache à un autre client, ou on archive. */
export async function deleteClient(callerUserId, companyId, id) {
  await resolveOwnedCompany(callerUserId, companyId);
  const client = await ownedClient(companyId, id);
  const linked = await CallCenterOperationClient.countDocuments({ companyId: oid(companyId), clientId: client._id });
  if (linked > 0) throw fail(409, `${linked} opération(s) sont rattachées à ce client : rattachez-les à un autre client, ou archivez-le.`);
  await client.deleteOne();
  return { id: String(client._id) };
}

export async function listOperationClients(callerUserId, companyId) {
  await resolveOwnedCompany(callerUserId, companyId);
  const rows = await CallCenterOperationClient.find({ companyId: oid(companyId) });
  return rows.map((r) => ({ gigId: String(r.gigId), clientId: String(r.clientId) }));
}

/** Rattache l'opération à un client (clientId), ou la détache (null). L'opération doit appartenir à la société. */
export async function setOperationClient(callerUserId, companyId, gigId, clientId) {
  await resolveOwnedCompany(callerUserId, companyId);
  if (!isId(gigId)) throw fail(400, 'Valid gigId is required');
  const gig = await mongoose.connection.db.collection('gigs').findOne({ _id: oid(gigId), companyId: oid(companyId) });
  if (!gig) throw fail(404, 'Operation not found for this company');
  if (clientId === null || clientId === undefined || clientId === '') {
    await CallCenterOperationClient.deleteOne({ companyId: oid(companyId), gigId: oid(gigId) });
    return { gigId: String(gigId), clientId: null };
  }
  const client = await ownedClient(companyId, clientId);
  if (client.status === 'archived') throw fail(409, 'Ce client est archivé : rétablissez-le avant de lui rattacher une opération.');
  await CallCenterOperationClient.findOneAndUpdate(
    { companyId: oid(companyId), gigId: oid(gigId) },
    { $set: { clientId: client._id } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return { gigId: String(gigId), clientId: String(client._id) };
}

export async function listOperationProfiles(callerUserId, companyId) {
  await resolveOwnedCompany(callerUserId, companyId);
  const rows = await CallCenterOperationProfile.find({ companyId: oid(companyId) });
  return rows.map(profileView);
}

/** Enregistre la description de l'opération (objectif, volume attendu) et ses indicateurs de pilotage. */
export async function setOperationProfile(callerUserId, companyId, gigId, body) {
  await resolveOwnedCompany(callerUserId, companyId);
  if (!isId(gigId)) throw fail(400, 'Valid gigId is required');
  const gig = await mongoose.connection.db.collection('gigs').findOne({ _id: oid(gigId), companyId: oid(companyId) });
  if (!gig) throw fail(404, 'Operation not found for this company');
  const { errors, value } = normalizeProfileInput(body);
  if (errors.length) throw fail(400, errors.join(' '));
  const doc = await CallCenterOperationProfile.findOneAndUpdate(
    { companyId: oid(companyId), gigId: oid(gigId) },
    { $set: value },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return profileView(doc);
}

/** Enregistre l'avis du centre sur sa mise en route (un avis par personne et par société, remplacé s'il est renvoyé). */
export async function saveOnboardingFeedback(callerUserId, companyId, body) {
  await resolveOwnedCompany(callerUserId, companyId);
  if (!isId(callerUserId)) throw fail(400, 'Valid user is required');
  const { errors, value } = normalizeFeedbackInput(body);
  if (errors.length) throw fail(400, errors.join(' '));
  const doc = await CallCenterOnboardingFeedback.findOneAndUpdate(
    { companyId: oid(companyId), userId: oid(callerUserId) },
    { $set: value },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return { rating: doc.rating, comment: doc.comment, durationSeconds: doc.durationSeconds };
}
