import mongoose from 'mongoose';
import User from '../models/User.js';
import CompanyMembership from '../models/CompanyMembership.js';
import AgentShift from '../models/AgentShift.js';
import ScheduleRequest from '../models/ScheduleRequest.js';
import { isCallCenterAgent } from '../constants/companyPermissions.js';
import {
  isDate,
  normalizeDecisionInput,
  normalizeRequestInput,
  normalizeShiftsInput,
  requestView,
  shiftView,
} from './callCenterScheduleValidation.js';

function fail(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const isId = (v) => mongoose.Types.ObjectId.isValid(String(v || ''));
const todayIso = () => new Date().toISOString().slice(0, 10);

/** Droit nécessaire pour planifier les agents et répondre à leurs demandes. */
export const MANAGE_PERMISSION = 'gigs.edit';

/**
 * Qui agit : le propriétaire et les membres qui ont le droit « gigs.edit » gèrent le planning ; un agent employé par
 * ce centre ne voit que le sien et fait ses demandes ; toute autre personne est refusée.
 */
async function resolveActor(callerUserId, companyId) {
  if (!callerUserId || !isId(callerUserId)) throw fail(401, 'Authentication required');
  if (!isId(companyId)) throw fail(400, 'Valid companyId is required');
  const caller = await User.findById(callerUserId);
  if (!caller) throw fail(401, 'Caller not found');
  const company = await mongoose.connection.db.collection('companies').findOne({ _id: oid(companyId) });
  if (!company) throw fail(404, 'Company not found');
  if (String(company.userId) === String(callerUserId)) return { role: 'owner', canManage: true, caller };
  if (isCallCenterAgent(caller) && String(caller.employerCompanyId) === String(companyId)) return { role: 'agent', canManage: false, caller };
  const membership = await CompanyMembership.findOne({ companyId: oid(companyId), userId: oid(callerUserId) }).select('permissions').lean();
  if (!membership) throw fail(403, 'You do not belong to this company');
  return { role: 'member', canManage: membership.permissions?.[MANAGE_PERMISSION] === true, caller };
}

const needManage = (actor) => {
  if (!actor.canManage) throw fail(403, 'Vous n’avez pas le droit de gérer le planning des agents.');
};
const needAgent = (actor) => {
  if (actor.role !== 'agent') throw fail(403, 'Cette action est réservée aux agents du centre.');
};

function range(query) {
  const from = String(query?.from || '');
  const to = String(query?.to || '');
  if (!isDate(from) || !isDate(to) || to < from) throw fail(400, 'La période est invalide.');
  return { from, to };
}

/** Mes créneaux (agent) sur une période. */
export async function listMyShifts(callerUserId, companyId, query) {
  const actor = await resolveActor(callerUserId, companyId);
  needAgent(actor);
  const { from, to } = range(query);
  const rows = await AgentShift.find({ companyId: oid(companyId), userId: oid(callerUserId), date: { $gte: from, $lte: to } }).sort({ date: 1, startTime: 1 });
  return rows.map(shiftView);
}

/** Créneaux des agents du centre (gestion), éventuellement d'un seul agent. */
export async function listAgentShifts(callerUserId, companyId, query) {
  const actor = await resolveActor(callerUserId, companyId);
  needManage(actor);
  const { from, to } = range(query);
  const filter = { companyId: oid(companyId), date: { $gte: from, $lte: to } };
  if (query?.userId) {
    if (!isId(query.userId)) throw fail(400, 'Valid userId is required');
    filter.userId = oid(query.userId);
  }
  const rows = await AgentShift.find(filter).sort({ date: 1, startTime: 1 });
  return rows.map(shiftView);
}

/** Remplace les créneaux d'un agent sur une période (envoi idempotent : une liste vide efface la période). */
export async function setAgentShifts(callerUserId, companyId, agentUserId, body) {
  const actor = await resolveActor(callerUserId, companyId);
  needManage(actor);
  if (!isId(agentUserId)) throw fail(400, 'Valid agent id is required');
  const agent = await User.findById(agentUserId);
  if (!agent || !isCallCenterAgent(agent) || String(agent.employerCompanyId) !== String(companyId)) throw fail(404, 'Agent not found in this company');
  const { errors, value } = normalizeShiftsInput(body);
  if (errors.length) throw fail(400, errors.join(' '));
  await AgentShift.deleteMany({ companyId: oid(companyId), userId: agent._id, date: { $gte: value.from, $lte: value.to } });
  if (value.shifts.length) {
    await AgentShift.insertMany(value.shifts.map((s) => ({ companyId: oid(companyId), userId: agent._id, date: s.date, startTime: s.startTime, endTime: s.endTime, gigId: s.gigId && isId(s.gigId) ? oid(s.gigId) : null, createdBy: oid(callerUserId) })));
  }
  const rows = await AgentShift.find({ companyId: oid(companyId), userId: agent._id, date: { $gte: value.from, $lte: value.to } }).sort({ date: 1, startTime: 1 });
  return rows.map(shiftView);
}

/** Mes demandes (agent), les plus récentes d'abord. */
export async function listMyRequests(callerUserId, companyId) {
  const actor = await resolveActor(callerUserId, companyId);
  needAgent(actor);
  const rows = await ScheduleRequest.find({ companyId: oid(companyId), userId: oid(callerUserId) }).sort({ createdAt: -1 }).limit(100);
  return rows.map(requestView);
}

export async function createRequest(callerUserId, companyId, body) {
  const actor = await resolveActor(callerUserId, companyId);
  needAgent(actor);
  const { errors, value } = normalizeRequestInput(body, todayIso());
  if (errors.length) throw fail(400, errors.join(' '));
  const doc = await ScheduleRequest.create({ ...value, companyId: oid(companyId), userId: oid(callerUserId), userName: actor.caller.fullName || actor.caller.email || '' });
  return requestView(doc);
}

/** L'agent retire sa demande tant qu'elle n'a pas reçu de réponse. */
export async function cancelRequest(callerUserId, companyId, id) {
  const actor = await resolveActor(callerUserId, companyId);
  needAgent(actor);
  if (!isId(id)) throw fail(400, 'Valid request id is required');
  const doc = await ScheduleRequest.findOneAndUpdate(
    { _id: oid(id), companyId: oid(companyId), userId: oid(callerUserId), status: 'pending' },
    { $set: { status: 'cancelled' } },
    { new: true }
  );
  if (!doc) throw fail(409, 'Cette demande n’existe pas ou a déjà reçu une réponse.');
  return requestView(doc);
}

/** Boîte du centre : demandes des agents, filtrables par statut. */
export async function listRequests(callerUserId, companyId, query) {
  const actor = await resolveActor(callerUserId, companyId);
  needManage(actor);
  const filter = { companyId: oid(companyId) };
  if (query?.status) filter.status = String(query.status);
  const rows = await ScheduleRequest.find(filter).sort({ createdAt: -1 }).limit(200);
  return rows.map(requestView);
}

/** Réponse du centre : acceptée ou refusée, une seule fois (la décision est atomique). */
export async function decideRequest(callerUserId, companyId, id, body) {
  const actor = await resolveActor(callerUserId, companyId);
  needManage(actor);
  if (!isId(id)) throw fail(400, 'Valid request id is required');
  const { errors, value } = normalizeDecisionInput(body);
  if (errors.length) throw fail(400, errors.join(' '));
  const doc = await ScheduleRequest.findOneAndUpdate(
    { _id: oid(id), companyId: oid(companyId), status: 'pending' },
    { $set: { status: value.decision, decidedBy: oid(callerUserId), decidedAt: new Date(), decisionNote: value.note } },
    { new: true }
  );
  if (!doc) throw fail(409, 'Cette demande n’existe pas ou a déjà reçu une réponse.');
  return requestView(doc);
}
