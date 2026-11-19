import assert from 'node:assert/strict';
import { countryWaitlistEmail, teamMemberInvitationEmail } from '../utils/harxMessages.js';

// Les e-mails du produit portent son nom : HARX Telephony (plus « Call Centre » ni « Centre d'appels »)
for (const locale of ['fr', 'en']) {
  const m = countryWaitlistEmail({ countryName: 'Allemagne', locale });
  assert.ok(/HARX Telephony/.test(m.subject), `liste d'attente (${locale}) : objet`);
  assert.ok(/TELEPHONY/.test(m.html) && /alt="HARX"/.test(m.html), `liste d'attente (${locale}) : logo et mention du produit`);
  assert.ok(!/Call Centre|Centre d'appels/.test(m.subject + m.html), `liste d'attente (${locale}) : ancien nom absent`);
}
const t = teamMemberInvitationEmail({ firstName: 'Ada', companyName: 'Acme', preset: 'agent', inviterName: 'Bob', email: 'ada@acme.fr', tempPassword: 'x', loginUrl: 'https://exemple.fr' });
assert.ok(/HARX Telephony/.test(t.subject) && /TELEPHONY/.test(t.html), 'invitation d’équipe : nom du produit');
assert.ok(!/Call Centre/.test(t.subject + t.html), 'invitation d’équipe : ancien nom absent');
console.log('telephonyEmails OK');

// Lien de connexion : le produit est toujours porté, avec ? ou & selon l'URL, sans doublon
import { inviteEmail, withProduct } from '../utils/harxMessages.js';
assert.equal(withProduct('https://harx.ai/auth/signin'), 'https://harx.ai/auth/signin?product=callcentre');
assert.equal(withProduct('https://harx.ai/auth/signin?lang=en'), 'https://harx.ai/auth/signin?lang=en&product=callcentre');
assert.equal(withProduct('https://harx.ai/auth/signin?'), 'https://harx.ai/auth/signin?product=callcentre');
assert.equal(withProduct('https://harx.ai/auth/signin?a=1&'), 'https://harx.ai/auth/signin?a=1&product=callcentre');
assert.equal(withProduct('https://harx.ai/auth/signin?product=callcentre'), 'https://harx.ai/auth/signin?product=callcentre');
assert.equal(withProduct('https://harx.ai/auth/signin?x=1&product=callcentre'), 'https://harx.ai/auth/signin?x=1&product=callcentre');
// Invitation d'agent : même lien que l'e-mail d'équipe (produit porté)
const a = inviteEmail({ firstName: 'Ada', email: 'ada@acme.fr', tempPassword: 'x', companyName: 'Acme', loginUrl: 'https://harx.ai/auth/signin' });
assert.ok(a.html.includes('https://harx.ai/auth/signin?product=callcentre'), 'invitation d’agent : produit dans le lien');
const a2 = inviteEmail({ firstName: 'Ada', email: 'ada@acme.fr', tempPassword: 'x', companyName: 'Acme', loginUrl: 'https://harx.ai/auth/signin?lang=en' });
assert.ok(a2.html.includes('lang=en&amp;product=callcentre'), 'invitation d’agent : & ajouté quand l’URL a déjà un ?');
const tm = teamMemberInvitationEmail({ firstName: 'Ada', companyName: 'Acme', preset: 'admin', email: 'ada@acme.fr', loginUrl: 'https://harx.ai/auth/signin?lang=en' });
assert.ok(tm.html.includes('lang=en&amp;product=callcentre'), 'invitation d’équipe : & ajouté quand l’URL a déjà un ?');
console.log('telephonyEmails (lien produit) OK');
