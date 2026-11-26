import test from 'node:test';
import assert from 'node:assert/strict';
import authService from '../services/authService.js';
import userRepository from '../repositories/userRepository.js';

// Aucun accès réseau ni base : dépôt et envois remplacés.
const req = { headers: {}, ip: '1.2.3.4', socket: {} };
authService.enrichIPInfo = async () => null;
const sentCodes = [];
authService.sendVerificationEmail = async (email, code) => { sentCodes.push({ email, code }); };
let created = 0;
userRepository.create = async () => { created++; return { _id: 'new' }; };

function appUser(over = {}) {
  return {
    _id: 'u1', email: 'alex@example.com', fullName: 'Alex', password: 'random', isVerified: false, disabled: false,
    appSignup: { source: 'ios-app', pending: true, consent: true, claimedAt: null }, signup: { offer: 'nomad', entry: '/app/ios' },
    ipHistory: [], saved: 0,
    async save() { this.saved++; return this; },
    ...over,
  };
}

test('inscription web : reprend un compte créé dans l’app (mot de passe, nom), garde l’offre et l’accord, envoie le code', async () => {
  const u = appUser();
  userRepository.findByEmail = async () => u;
  // Avant la reprise, l'inscription web voit l'adresse comme disponible (étape « e-mail » du formulaire).
  assert.deepEqual(await authService.checkEmailAvailable('alex@example.com'), { available: true });
  const { result } = await authService.register({ fullName: 'Alex Martin', email: 'Alex@Example.com', password: 'motdepasse1' }, req);
  assert.equal(result, u);
  assert.equal(created, 0);
  assert.equal(u.saved, 1);
  assert.equal(u.password, 'motdepasse1'); // haché ensuite par le hook pre('save')
  assert.equal(u.fullName, 'Alex Martin');
  assert.equal(u.appSignup.pending, false);
  assert.ok(u.appSignup.claimedAt instanceof Date);
  assert.equal(u.appSignup.consent, true);
  assert.equal(u.signup.offer, 'nomad');
  assert.equal(u.isVerified, false);
  assert.equal(sentCodes.at(-1).email, 'alex@example.com');
  assert.equal(u.verificationCode.code, sentCodes.at(-1).code);
  // Après la reprise : compte normal, adresse prise.
  assert.deepEqual(await authService.checkEmailAvailable('alex@example.com'), { available: false });
});

test('inscription web : un compte vérifié (ou d’une autre origine) n’est jamais repris', async () => {
  userRepository.findByEmail = async () => appUser({ isVerified: true });
  await assert.rejects(authService.register({ fullName: 'X', email: 'alex@example.com', password: 'motdepasse1' }, req), /Email already registered/);
  assert.deepEqual(await authService.checkEmailAvailable('alex@example.com'), { available: false });
  userRepository.findByEmail = async () => ({ email: 'alex@example.com', isVerified: false });
  await assert.rejects(authService.register({ fullName: 'X', email: 'alex@example.com', password: 'motdepasse1' }, req), /Email already registered/);
});
