import assert from 'node:assert/strict';
import { serializeInvitedAccount } from '../utils/invitedAccount.js';

const account = { _id: 'u1', email: 'Pro@Mail.com', fullName: 'Chafik AGENT CC', phone: '0623984708', isVerified: true };
const invitation = { companyId: 'c1', email: 'pro@mail.com', fullName: 'Chafik Sabiry', phone: '', status: 'pending', invitedAt: '2026-10-29T10:00:00Z' };

// En attente : le centre voit ce qu'il a saisi, rien du profil du compte (nom d'un autre centre, téléphone)
let out = serializeInvitedAccount(account, invitation);
assert.equal(out.userId, 'u1');
assert.equal(out.fullName, 'Chafik Sabiry');
assert.equal(out.phone, '');
assert.equal(out.isVerified, false);
assert.equal(out.employerCompanyId, null);
assert.equal(out.invitationStatus, 'invited');
assert.equal(out.email, 'pro@mail.com');

// Sans nom saisi : la partie avant l'@, jamais le nom du compte
out = serializeInvitedAccount(account, { ...invitation, fullName: '' });
assert.equal(out.fullName, 'pro');

// Téléphone saisi par le centre : conservé
out = serializeInvitedAccount(account, { ...invitation, phone: ' 0102030405 ' });
assert.equal(out.phone, '0102030405');

// Après acceptation : la personne a consenti, son profil peut compléter ce que le centre n'a pas saisi
out = serializeInvitedAccount(account, { ...invitation, fullName: '', status: 'accepted' });
assert.equal(out.fullName, 'Chafik AGENT CC');
assert.equal(out.phone, '0623984708');
assert.equal(out.invitationStatus, 'active');
assert.equal(out.employerCompanyId, 'c1');
console.log('invitedAccount OK');
