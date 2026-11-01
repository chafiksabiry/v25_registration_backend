import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import CallCenterClientAccess from '../models/CallCenterClientAccess.js';
import CallCenterClient from '../models/CallCenterClient.js';
import CallCenterOperationClient from '../models/CallCenterOperationClient.js';
import CallCenterBranding from '../models/CallCenterBranding.js';
import User from '../models/User.js';
import companyMemberService from '../services/companyMemberService.js';
import CompanyMembership from '../models/CompanyMembership.js';
import { clientPortalSession } from '../services/callCenterClientPortalService.js';

const oid = () => new mongoose.Types.ObjectId();
const companyId = oid();
const clientA = oid();
const clientB = oid();
const gigA1 = oid(); const gigA2 = oid(); const gigB1 = oid(); const gigOwn = oid();
const links = [
  { companyId, clientId: clientA, gigId: gigA1 }, { companyId, clientId: clientA, gigId: gigA2 }, { companyId, clientId: clientB, gigId: gigB1 },
];
let state;
const reset = (over = {}) => {
  state = { access: { companyId, clientId: clientA, userId: oid(), status: 'active', allowRecordings: false, save: async () => {} }, product: 'multi_clients', clientStatus: 'active', ...over };
};
CallCenterClientAccess.findOne = async () => state.access;
CallCenterClient.findOne = async (q) => (String(q._id) === String(clientA) ? { _id: clientA, name: 'Client A', status: state.clientStatus } : { _id: clientB, name: 'Client B', status: 'active' });
CallCenterOperationClient.find = async (q) => links.filter((l) => String(l.clientId) === String(q.clientId));
CallCenterBranding.findOne = async () => ({ displayName: 'Marque du centre', logoUrl: 'https://x.fr/l.png', primaryColor: '#112233' });
User.updateOne = async () => ({});
const plan = () => ({ _id: 'p1', metadata: { harx_product: 'callcenter', callcenter_tier: state.product } });
const coll = (name) => ({
  findOne: async (q) => (name === 'companies' ? (q && q.$or ? null :  { _id: companyId, name: 'Centre X', userId: oid() }) : name === 'subscriptionplans' ? plan() : null),
  find: () => ({ sort: () => ({ limit: () => ({ next: async () => (state.product ? { planId: 'p1', status: 'active' } : null) }) }) }),
});
Object.defineProperty(mongoose.connection, 'db', { get: () => ({ collection: coll }), configurable: true });

const caller = { _id: oid() };

reset();
let s = await clientPortalSession(caller);
assert.equal(s.isClient, true);
assert.equal(s.isOwner, false);
assert.equal(s.isAgent, false);
assert.equal(s.companyId, null, 'la société du centre n’est jamais exposée aux autres services');
assert.equal(s.client.companyId, undefined, 'aucun identifiant de société côté client');
assert.deepEqual(s.client.gigIds.sort(), [String(gigA1), String(gigA2)].sort(), 'seulement les opérations de CE client');
assert.ok(!s.client.gigIds.includes(String(gigB1)) && !s.client.gigIds.includes(String(gigOwn)));
assert.equal(s.permissions['calls.view'], true);
assert.equal(s.permissions['calls.listen'], false);
assert.equal(s.permissions['gigs.create'], false);
assert.equal(s.client.branding.displayName, 'Marque du centre');
assert.equal(s.client.branding.primaryColor, '#112233');

reset({ access: { companyId, clientId: clientA, userId: oid(), status: 'active', allowRecordings: true, save: async () => {} } });
s = await clientPortalSession(caller);
assert.equal(s.permissions['calls.listen'], true);
assert.equal(s.client.allowRecordings, true);

// Fermé par défaut
for (const [label, over, reason] of [
  ['accès retiré', { access: { companyId, clientId: clientA, status: 'revoked' } }, 'revoked'],
  ['aucun accès', { access: null }, 'revoked'],
  ['centre hors multi-clients', { product: 'full_scope' }, 'plan'],
  ['centre sans abonnement', { product: null }, 'plan'],
  ['client archivé', { clientStatus: 'archived' }, 'client'],
]) {
  reset(over);
  s = await clientPortalSession(caller);
  assert.equal(s.isClient, true, label);
  assert.equal(s.client, null, label);
  assert.equal(s.companyId, null, label);
  assert.equal(Object.values(s.permissions).some(Boolean), false, `${label} : aucun droit`);
  assert.equal(s.closedReason, reason, label);
}

// /me : un contact client n'obtient jamais le repli « titulaire » (accès complet) réservé aux comptes sans rôle
reset();
User.findById = async () => ({ _id: caller._id, typeUser: 'client-portal' });
CompanyMembership.findOne = () => ({ sort: async () => null });
let me = await companyMemberService.session(String(caller._id));
assert.equal(me.isClient, true);
assert.equal(me.isOwner, false);
assert.equal(me.companyId, null);
User.findById = async () => ({ _id: caller._id, typeUser: 'company' });
me = await companyMemberService.session(String(caller._id));
assert.equal(me.isOwner, true, 'les comptes existants gardent leur comportement');
console.log('callCenterClientPortalSession OK');
process.exit(0);
