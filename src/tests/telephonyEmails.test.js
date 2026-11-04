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
