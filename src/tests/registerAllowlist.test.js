import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../models/User.js';
import authService from '../services/authService.js';
import userRepository from '../repositories/userRepository.js';
import { register as registerController } from '../controllers/authController.js';
import { pickSignupFields, SIGNUP_FIELDS } from '../utils/signupFields.js';

// Pas de base : on capte ce que register() écrirait et on valide le document Mongoose sans le sauvegarder.
const created = [];
userRepository.findByEmail = async () => null;
userRepository.create = async (data) => {
  const doc = new User(data);
  const err = doc.validateSync();
  if (err) throw err;
  created.push({ data, doc });
  return doc;
};
authService.enrichIPInfo = async () => null;
authService.sendVerificationEmail = async () => {};
const req = { headers: {}, socket: { remoteAddress: '127.0.0.1' }, ip: '127.0.0.1' };

const companyId = new mongoose.Types.ObjectId().toString();
const forged = {
  isVerified: true,
  typeUser: 'admin',
  product: 'callcentre',
  employerCompanyId: companyId,
  employments: [{ companyId, status: 'active' }],
  linkedInId: 'li-forged',
  verificationCode: { code: '000000', expiresAt: new Date(Date.now() + 3600e3) },
  mustChangePassword: true,
  invitationStatus: 'active',
  invitedByUserId: new mongoose.Types.ObjectId().toString(),
  firstTime: false,
  source: 'v1',
  importBatch: 'batch-x',
  reengagement: { tokenHash: 'a'.repeat(64), expiresAt: new Date(Date.now() + 3600e3) },
  inviteLogin: { tokenHash: 'b'.repeat(64), expiresAt: new Date(Date.now() + 3600e3) },
  pendingChanges: { emailChange: { newEmail: 'x@ex.com', code: '1' } },
  ipHistory: [{ ip: '6.6.6.6', action: 'login' }],
  createdAt: new Date('2000-01-01'),
  legacyV1: { segment: 'x' },
};
const SERVER_ONLY = Object.keys(forged);

function assertNoForgedField(data, doc) {
  for (const key of SERVER_ONLY) {
    if (key === 'verificationCode' || key === 'ipHistory') continue; // fixés par le serveur, vérifiés à part
    if (key === 'isVerified') { assert.equal(data.isVerified, false); continue; } // écrit à false par le serveur
    assert.equal(key in data, false, `${key} ne doit pas être transmis à la création`);
  }
  assert.equal(doc.isVerified, false);
  assert.equal(doc.typeUser, null);
  assert.equal(doc.product, null);
  assert.equal(doc.employerCompanyId, null);
  assert.deepEqual(doc.employments.toObject(), []);
  assert.equal(doc.linkedInId, undefined);
  assert.equal(doc.mustChangePassword, false);
  assert.equal(doc.invitationStatus, 'none');
  assert.equal(doc.invitedByUserId, null);
  assert.equal(doc.firstTime, true);
  assert.equal(doc.source, null);
  assert.equal(doc.legacyV1, null);
  assert.ok(doc.createdAt.getFullYear() > 2000);
  assert.notEqual(doc.verificationCode.code, '000000');
  assert.match(doc.verificationCode.code, /^\d{6}$/);
  assert.equal(doc.ipHistory.length, 1);
  assert.equal(doc.ipHistory[0].action, 'register');
  assert.notEqual(doc.ipHistory[0].ip, '6.6.6.6');
}

// 1. Corps forgé : compte non vérifié, type par défaut, sans centre ni autre champ serveur
{
  const { result } = await authService.register(
    { ...forged, fullName: 'Pirate', email: 'Pirate@Ex.com', password: 'motdepasse1' },
    req
  );
  assert.ok(result._id);
  const { data, doc } = created.at(-1);
  assertNoForgedField(data, doc);
  assert.equal(doc.email, 'pirate@ex.com');
  assert.equal(doc.fullName, 'Pirate');
}

// 2. Même chose via le contrôleur HTTP (req.body brut)
{
  let status;
  let payload;
  const res = { status(code) { status = code; return this; }, json(body) { payload = body; return this; } };
  await registerController({ ...req, body: { ...forged, fullName: 'Via Http', email: 'http@ex.com', password: 'motdepasse1' } }, res);
  assert.equal(status, 201, JSON.stringify(payload));
  const { data, doc } = created.at(-1);
  assertNoForgedField(data, doc);
}

// 3. Inscription normale (formulaire du front) : champs conservés, mot de passe haché à l'enregistrement
{
  await authService.register(
    { fullName: 'Marie Durand', email: 'marie@ex.com', password: 'motdepasse1', phone: ' +33 6 23 98 47 08 ' },
    req
  );
  const { data, doc } = created.at(-1);
  assert.deepEqual(
    Object.keys(data).sort(),
    // `journey` : date de création du parcours d'inscription, fixée par le serveur (utils/signupJourney.js).
    ['email', 'fullName', 'ipHistory', 'isVerified', 'journey', 'password', 'phone', 'verificationCode']
  );
  assert.equal(doc.fullName, 'Marie Durand');
  assert.equal(doc.email, 'marie@ex.com');
  assert.equal(doc.password, 'motdepasse1');
  assert.equal(doc.phone, '+33 6 23 98 47 08');
  assert.equal(doc.isVerified, false);
}

// 4. Sans téléphone (PR #62/#63) : toujours accepté, champ non écrit
{
  await authService.register({ fullName: 'Sans Tel', email: 'sanstel@ex.com', password: 'motdepasse1' }, req);
  assert.equal('phone' in created.at(-1).data, false);
}

// 5. Champs de mesure envoyés par le front de production : l'origine utm_ est gardée (filtrée), le reste ignoré
{
  await authService.register(
    {
      fullName: 'Meta Lead',
      email: 'meta@ex.com',
      password: 'motdepasse1',
      metaEventId: 'evt-1',
      marketingConsent: true,
      fbp: 'fb.1.1.1',
      fbc: 'fb.1.1.2',
      sourceUrl: 'https://harx.ai/',
      attribution: { utm_source: 'facebook', utm_campaign: 'c1', isVerified: true, typeUser: 'admin', utm_term: 42 },
    },
    req
  );
  const { data } = created.at(-1);
  assert.deepEqual(data.attribution, { utm_source: 'facebook', utm_campaign: 'c1' });
  for (const key of ['metaEventId', 'marketingConsent', 'fbp', 'fbc', 'sourceUrl']) assert.equal(key in data, false);
}

// 6. Helper : seule la liste blanche ressort ; types non texte ignorés
assert.deepEqual([...SIGNUP_FIELDS], ['fullName', 'email', 'password', 'phone', 'attribution']);
assert.deepEqual(pickSignupFields({ ...forged, email: 'a@b.c', password: { $gt: '' }, fullName: ['x'] }), { email: 'a@b.c' });
assert.deepEqual(pickSignupFields(null), {});
assert.deepEqual(pickSignupFields({ attribution: ['utm_source'] }), {});

// 7. Les règles existantes tiennent toujours
await assert.rejects(authService.register({ ...forged, fullName: 'X', email: 'w@ex.com', password: 'court' }, req), /Password must be/);
await assert.rejects(authService.register({ fullName: 'X', email: 'p@ex.com', password: 'motdepasse1', phone: 'abc' }, req), /Invalid phone/);

console.log('registerAllowlist OK');
