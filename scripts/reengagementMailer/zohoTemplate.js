#!/usr/bin/env node
/**
 * Writes the bilingual re-engagement e-mail as a ready-to-upload HTML template for Zoho Campaigns.
 * Every recipient gets the same public link; the personal one-click link is e-mailed after they
 * type their address on that page (POST /api/auth/reengage-request), so nothing is merged per contact.
 * The Zoho unsubscribe tag required by Campaigns is appended to the footer.
 *
 *   node zohoTemplate.js --out campaign.html                   (production addresses)
 *   node zohoTemplate.js --env recette --out test.html         (recette addresses, for a test send)
 */
import fs from 'fs';
import { renderEmail, SUBJECTS } from './lib/template.js';

const ENVIRONMENTS = {
  production: {
    link: 'https://harx.ai/auth/reactivate',
    banner: 'https://v25registrationbackend-production.up.railway.app/email/harx-banner.jpg',
  },
  recette: {
    link: 'https://harx26connection-recette.netlify.app/auth/reactivate',
    banner: 'https://v25registrationbackend-recette.up.railway.app/email/harx-banner.jpg',
  },
};

export const UNSUBSCRIBE_BLOCK =
  '<p style="margin:10px 0 0 0;font-size:12px;line-height:1.6;color:#fbcfe8;"><a href="$[LI:UNSUBSCRIBE]$" style="color:#ffffff;text-decoration:underline;">Unsubscribe &middot; Se d&eacute;sabonner</a></p>';

export function buildZohoHtml(env = 'production') {
  const cfg = ENVIRONMENTS[env];
  if (!cfg) throw new Error(`unknown environment: ${env}`);
  const { html } = renderEmail({ link: cfg.link, bannerUrl: cfg.banner, lang: 'bi', linkKind: 'public' });
  const marker = '</p>\n</td></tr>\n\n</table>';
  if (!html.includes(marker)) throw new Error('footer marker not found in the template');
  return html.replace(marker, `</p>\n${UNSUBSCRIBE_BLOCK}\n</td></tr>\n\n</table>`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const args = process.argv.slice(2);
  const opt = (n, d) => (args.includes(n) && args[args.indexOf(n) + 1]) || d;
  const env = opt('--env', 'production');
  const out = opt('--out', `zoho-campaigns-${env}.html`);
  fs.writeFileSync(out, buildZohoHtml(env));
  console.log(`Written ${out} (${env}). Subject: ${SUBJECTS.bi}`);
}
