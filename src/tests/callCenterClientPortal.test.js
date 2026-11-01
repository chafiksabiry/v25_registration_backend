import assert from 'node:assert/strict';
import { allPermissionKeys, clientPermissions, isClientPortalUser, isCallCenterAgent } from '../constants/companyPermissions.js';
import { accessView, brandingView, normalizeBrandingInput, normalizeClientAccessInput, validLogoUrl } from '../services/callCenterClientPortalValidation.js';
import { clientPortalInvitationEmail } from '../utils/harxMessages.js';

// Logo : https + png/jpg/svg seulement
for (const ok of ['https://cdn.exemple.fr/logo.png', 'https://exemple.fr/a/b/logo.JPG', 'https://exemple.fr/logo.jpeg?v=2', 'https://exemple.fr/logo.svg']) assert.equal(validLogoUrl(ok), true, ok);
for (const bad of ['http://exemple.fr/logo.png', 'https://exemple.fr/logo.gif', 'https://exemple.fr/logo', 'javascript:alert(1)//.png', 'https://user:pw@exemple.fr/logo.png', 'https://exemple.fr/lo go.png', 'https://exemple.fr/logo.png"onerror=x', 'data:image/png;base64,AAAA', '', 'https://localhost/logo.png', 'https://exemple.fr/<b>.png']) assert.equal(validLogoUrl(bad), false, bad);

// Marque
let r = normalizeBrandingInput({ displayName: ' Acme Contact ', logoUrl: 'https://exemple.fr/l.png', primaryColor: '#e11d48' });
assert.deepEqual(r.errors, []);
assert.deepEqual(r.value, { displayName: 'Acme Contact', logoUrl: 'https://exemple.fr/l.png', primaryColor: '#E11D48' });
r = normalizeBrandingInput({ displayName: 'A', logoUrl: 'http://x.fr/l.png', primaryColor: 'rouge' });
assert.equal(r.errors.length, 3);
r = normalizeBrandingInput({ displayName: 'Marque seule' });
assert.deepEqual(r.errors, []);
assert.equal(r.value.logoUrl, '');
assert.equal(normalizeBrandingInput({ displayName: 'x'.repeat(80) }).value.displayName.length, 60);
assert.equal(normalizeBrandingInput({ displayName: 'Ok', primaryColor: '#12345' }).errors.length, 1);

// Invitation
assert.equal(normalizeClientAccessInput({ email: 'pas-un-mail' }).errors.length, 1);
r = normalizeClientAccessInput({ email: ' Contact@Client.FR ', fullName: ' Léa ' });
assert.deepEqual(r.value, { email: 'contact@client.fr', fullName: 'Léa', allowRecordings: false }, 'écoute des enregistrements refusée par défaut');
assert.equal(normalizeClientAccessInput({ email: 'a@b.fr', allowRecordings: 'oui' }).errors.length, 1);
assert.equal(normalizeClientAccessInput({ allowRecordings: true }, { partial: true }).value.allowRecordings, true);

// Vues
assert.equal(brandingView(null, 'Mon centre').displayName, 'Mon centre');
assert.equal(brandingView(null, 'Mon centre').configured, false);
assert.equal(brandingView({ displayName: 'Marque', primaryColor: '#111111' }).configured, true);
assert.equal(accessView({ userId: 'u', clientId: 'c', email: 'a@b.fr', allowRecordings: 1, status: 'active' }).allowRecordings, true);

// Droits : lecture des appels seulement, jamais de gestion
const base = clientPermissions();
assert.deepEqual(Object.keys(base).filter((k) => base[k]), ['calls.view']);
const withRec = clientPermissions({ allowRecordings: true });
assert.deepEqual(Object.keys(withRec).filter((k) => withRec[k]).sort(), ['calls.listen', 'calls.view']);
for (const k of allPermissionKeys()) {
  if (!/^calls\.(view|listen)$/.test(k)) assert.equal(withRec[k], false, `${k} refusé à un contact client`);
}
// Un client n'est ni agent ni membre
assert.equal(isClientPortalUser({ typeUser: 'client-portal' }), true);
assert.equal(isClientPortalUser({ typeUser: 'rep' }), false);
assert.equal(isCallCenterAgent({ typeUser: 'client-portal', employerCompanyId: '64b000000000000000000001' }), false);

// E-mail : nomme le centre, pas HARX dans le texte ; échappe les entrées
const mail = clientPortalInvitationEmail({ firstName: '<b>Léa</b>', email: 'a@b.fr', tempPassword: 'Pw<1>', centerName: 'Acme Contact', clientName: 'Client & Cie', loginUrl: 'https://x.fr/login' });
assert.match(mail.subject, /Acme Contact/);
assert.ok(!mail.html.includes('<b>Léa</b>') && !mail.html.includes('Pw<1>'));
assert.match(mail.html, /Client &amp; Cie/);
assert.match(mail.html, /lecture seule/);
console.log('callCenterClientPortal OK');
