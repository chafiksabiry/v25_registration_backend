export const SUBJECT = 'Votre espace HARX vous attend : 6 mois offerts';
export const PREHEADER = 'Reprenez votre compte en un clic et activez votre formule avant le 31 décembre 2026.';
export const PLAN_NAME = "IN THE RICH MAN'S WORLD";
export const PROMO_CODE = 'REPS2027';
export const PRICE_AFTER = '59,99 €';
export const DEADLINE = '31 décembre 2026';
export const POSTAL_ADDRESS = 'HARX Technologies Inc., 16192 Coastal Highway, Lewes, Delaware 19958, USA';
export const SUPPORT_ADDRESS = 'reps-support@harx.ai';

const STEPS = [
  'Importer votre CV',
  'Valider votre profil',
  'Prendre une photo en direct',
  'Indiquer vos créneaux de travail',
  `Choisir la formule « ${PLAN_NAME} » et saisir le code ${PROMO_CODE} : 6 mois offerts, sans carte bancaire à l'activation. Ensuite, la formule est facturée ${PRICE_AFTER} par mois.`,
];

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** One-click link: <base>/auth/reactivate?t=<token> (page served by the registration front). */
export function buildLink(linkBase, token) {
  if (!/^https:\/\//.test(linkBase || '')) throw new Error('link base must start with https://');
  return `${linkBase.replace(/\/+$/, '')}/auth/reactivate?t=${encodeURIComponent(token)}`;
}

export function renderEmail({ link }) {
  if (!link) throw new Error('link is required');

  const text = [
    'Bonjour,',
    '',
    'Vous vous étiez inscrit(e) sur HARX, la plateforme qui met en relation des professionnels de la relation client à distance avec des entreprises. Votre compte a été transféré sur la nouvelle plateforme.',
    '',
    'Reprenez là où vous en étiez, en un clic :',
    link,
    '',
    'En 5 étapes :',
    ...STEPS.map((s, i) => `${i + 1}. ${s}`),
    '',
    `Offre valable jusqu'au ${DEADLINE}.`,
    'Ce lien est personnel : ne le transférez pas.',
    '',
    'Vous recevez cet e-mail car vous avez créé un compte sur HARX. Pour ne plus en recevoir, répondez STOP à ce message.',
    POSTAL_ADDRESS,
    '',
  ].join('\n');

  const safeLink = escapeHtml(link);
  const html = `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(SUBJECT)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(PREHEADER)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;padding:32px;">
<tr><td style="font-size:22px;font-weight:bold;color:#e11d48;padding-bottom:16px;">HARX</td></tr>
<tr><td style="font-size:16px;line-height:1.5;padding-bottom:16px;">Bonjour,</td></tr>
<tr><td style="font-size:16px;line-height:1.5;padding-bottom:16px;">Vous vous étiez inscrit(e) sur HARX, la plateforme qui met en relation des professionnels de la relation client à distance avec des entreprises. Votre compte a été transféré sur la nouvelle plateforme.</td></tr>
<tr><td style="font-size:16px;line-height:1.5;padding-bottom:20px;">Reprenez là où vous en étiez, en un clic :</td></tr>
<tr><td style="padding-bottom:24px;"><a href="${safeLink}" style="background:#e11d48;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 28px;border-radius:8px;display:inline-block;">Reprendre mon compte</a></td></tr>
<tr><td style="font-size:16px;line-height:1.5;padding-bottom:8px;"><strong>En 5 étapes :</strong></td></tr>
<tr><td style="font-size:15px;line-height:1.6;padding-bottom:20px;"><ol style="margin:0;padding-left:22px;">${STEPS.map((s) => `<li style="margin-bottom:6px;">${escapeHtml(s)}</li>`).join('')}</ol></td></tr>
<tr><td style="font-size:15px;line-height:1.5;padding-bottom:8px;"><strong>Offre valable jusqu'au ${escapeHtml(DEADLINE)}.</strong></td></tr>
<tr><td style="font-size:14px;line-height:1.5;color:#6b7280;padding-bottom:24px;">Ce lien est personnel : ne le transférez pas. Le bouton ne fonctionne pas ? Copiez cette adresse dans votre navigateur : <span style="word-break:break-all;">${safeLink}</span></td></tr>
<tr><td style="font-size:12px;line-height:1.5;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:16px;">Vous recevez cet e-mail car vous avez créé un compte sur HARX. Pour ne plus en recevoir, répondez STOP à ce message.<br>${escapeHtml(POSTAL_ADDRESS)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;

  return { subject: SUBJECT, text, html };
}
