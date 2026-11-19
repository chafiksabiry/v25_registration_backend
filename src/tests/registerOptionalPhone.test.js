import assert from 'node:assert/strict';
import User from '../models/User.js';
import authService from '../services/authService.js';
import userRepository from '../repositories/userRepository.js';
import { normalizeOptionalPhone } from '../utils/phone.js';

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
const base = { fullName: 'Test Inscrit', password: 'motdepasse1' };

// 1. Inscription par e-mail sans téléphone : acceptée, champ non écrit (ni '' ni null)
for (const phone of [undefined, '', '   ', null]) {
  const { result } = await authService.register({ ...base, email: `a${created.length}@ex.com`, phone }, req);
  assert.ok(result._id);
  const last = created.at(-1);
  assert.equal('phone' in last.data, false, `phone ${JSON.stringify(phone)} ne doit pas être écrit`);
  assert.equal(last.doc.phone, undefined);
}

// 2. Téléphone invalide : rejeté avant toute écriture
const before = created.length;
for (const phone of ['abc', '12', '+33 6 ab 98', '<script>']) {
  await assert.rejects(
    authService.register({ ...base, email: 'bad@ex.com', phone }, req),
    /Invalid phone number format/
  );
}
assert.equal(created.length, before);

// Téléphone valide : conservé (rogné)
await authService.register({ ...base, email: 'ok@ex.com', phone: ' +33 6 23 98 47 08 ' }, req);
assert.equal(created.at(-1).doc.phone, '+33 6 23 98 47 08');

// 3. Deux comptes sans téléphone ne se heurtent pas : aucun index unique sur phone
assert.notEqual(User.schema.path('phone').options.unique, true);
const phoneIndexes = User.schema.indexes().filter(([fields]) => 'phone' in fields);
assert.deepEqual(phoneIndexes, []);
const noPhone = created.filter((c) => c.doc.phone === undefined);
assert.ok(noPhone.length >= 2);

// Le modèle n'exige plus le téléphone, y compris hors LinkedIn / invitation
assert.equal(new User({ email: 'm@ex.com', fullName: 'M', password: 'x' }).validateSync(), undefined);

// Helper
assert.equal(normalizeOptionalPhone(''), undefined);
assert.equal(normalizeOptionalPhone('0623984708'), '0623984708');
assert.throws(() => normalizeOptionalPhone('abc'), /Invalid phone number format/);
console.log('registerOptionalPhone OK');
