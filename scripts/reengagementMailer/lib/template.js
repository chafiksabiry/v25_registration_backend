export const SUBJECT = 'Votre espace HARX vous attend : 6 mois offerts';
export const PREHEADER = 'Reprenez votre compte en un clic et activez votre formule avant le 31 décembre 2026.';
export const PLAN_NAME = "IN THE RICH MAN'S WORLD";
export const PROMO_CODE = 'REPS2027';
export const DEADLINE = '31 décembre 2026';
export const POSTAL_ADDRESS = 'HARX Technologies Inc., 16192 Coastal Highway, Lewes, Delaware 19958, USA';
export const SUPPORT_ADDRESS = 'reps-support@harx.ai';
export const BANNER_PATH = '/email/harx-banner.jpg';

// Brand colors (registration front: src/lib/harxBrand.ts)
const ORANGE = '#F7941E';
const RED = '#ED1C24';
const MAGENTA = '#E6188D';
const MAGENTA_DEEP = '#C2186F';
const MAGENTA_DARK = '#8A1250';
const GRADIENT = `linear-gradient(135deg,${RED} 0%,${MAGENTA} 100%)`;
const FONT = "'Segoe UI',Tahoma,Arial,Helvetica,sans-serif";

const STEPS = [
  'Importer votre CV',
  'Valider votre profil',
  'Prendre une photo en direct',
  'Indiquer vos créneaux de travail',
  `Choisir la formule « ${PLAN_NAME} » et saisir le code ${PROMO_CODE}`,
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

export function buildBannerUrl(assetBase) {
  if (!/^https:\/\//.test(assetBase || '')) throw new Error('asset base must start with https://');
  return `${assetBase.replace(/\/+$/, '')}${BANNER_PATH}`;
}

/** `bannerUrl` may also be a data: URI (local preview). */
export function renderEmail({ link, bannerUrl }) {
  if (!link) throw new Error('link is required');
  if (!bannerUrl) throw new Error('bannerUrl is required');

  const text = [
    'HARX - We inspire growth',
    '',
    'Bonjour,',
    '',
    'Vous vous étiez inscrit(e) sur HARX, la plateforme qui met en relation des professionnels de la relation client à distance avec des entreprises. Votre compte a été transféré sur la nouvelle plateforme.',
    '',
    `6 MOIS OFFERTS avec la formule « ${PLAN_NAME} » : saisissez le code ${PROMO_CODE} au moment du choix de la formule.`,
    `Offre valable jusqu'au ${DEADLINE}.`,
    '',
    'Reprenez là où vous en étiez, en un clic :',
    link,
    '',
    'En 5 étapes :',
    ...STEPS.map((s, i) => `${i + 1}. ${s}`),
    '',
    "Aucune carte bancaire n'est demandée à l'activation.",
    'Ce lien est personnel : ne le transférez pas.',
    '',
    'Vous recevez cet e-mail car vous avez créé un compte sur HARX. Pour ne plus en recevoir, répondez STOP à ce message.',
    POSTAL_ADDRESS,
    '',
  ].join('\n');

  const safeLink = escapeHtml(link);
  const stepsHtml = STEPS.map(
    (s, i) => `<tr>
<td width="36" valign="top" style="padding:0 0 14px 0;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="28" height="28" align="center" valign="middle" bgcolor="${MAGENTA}" style="background-color:${MAGENTA};border-radius:14px;color:#ffffff;font-family:${FONT};font-size:14px;font-weight:700;line-height:28px;">${i + 1}</td></tr></table></td>
<td valign="top" style="padding:3px 0 14px 0;font-family:${FONT};font-size:16px;line-height:1.45;color:#1e293b;">${escapeHtml(s)}</td>
</tr>`
  ).join('\n');

  const html = `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(SUBJECT)}</title></head>
<body style="margin:0;padding:0;background-color:#fff1f2;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#fff1f2;">${escapeHtml(PREHEADER)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#fff1f2" style="background-color:#fff1f2;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #fecdd3;">

<tr><td style="padding:0;line-height:0;font-size:0;" bgcolor="${MAGENTA}"><img src="${escapeHtml(bannerUrl)}" width="600" alt="HARX - We inspire growth" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></td></tr>

<tr><td style="padding:32px 36px 4px 36px;font-family:${FONT};">
<p style="margin:0 0 10px 0;font-size:12px;font-weight:700;letter-spacing:0.16em;color:${MAGENTA};">VOTRE ESPACE REP</p>
<h1 style="margin:0 0 14px 0;font-size:28px;line-height:1.2;color:#0f172a;font-weight:800;">Votre espace HARX vous attend</h1>
<p style="margin:0 0 10px 0;font-size:16px;line-height:1.6;color:#475569;">Bonjour,</p>
<p style="margin:0;font-size:16px;line-height:1.6;color:#475569;">Vous vous étiez inscrit(e) sur HARX, la plateforme qui met en relation des professionnels de la relation client à distance avec des entreprises. Votre compte a été transféré sur la nouvelle plateforme.</p>
</td></tr>

<tr><td style="padding:24px 36px 8px 36px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${MAGENTA}" style="background-color:${MAGENTA};background-image:${GRADIENT};border-radius:18px;">
<tr><td align="center" style="padding:26px 20px;font-family:${FONT};color:#ffffff;">
<p style="margin:0 0 6px 0;font-size:12px;font-weight:700;letter-spacing:0.18em;color:#ffffff;">OFFRE REPS</p>
<p style="margin:0 0 8px 0;font-size:34px;line-height:1.1;font-weight:800;color:#ffffff;">6 mois offerts</p>
<p style="margin:0 0 14px 0;font-size:15px;line-height:1.5;color:#ffffff;">avec la formule « ${escapeHtml(PLAN_NAME)} »</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="#ffffff" style="background-color:#ffffff;border-radius:12px;padding:10px 22px;font-family:${FONT};font-size:13px;color:${MAGENTA_DARK};">Code&nbsp;<strong style="font-size:20px;letter-spacing:0.12em;color:${MAGENTA_DARK};">${escapeHtml(PROMO_CODE)}</strong></td></tr></table>
<p style="margin:14px 0 0 0;font-size:13px;line-height:1.4;color:#ffffff;">Valable jusqu'au ${escapeHtml(DEADLINE)}</p>
</td></tr>
</table>
</td></tr>

<tr><td align="center" style="padding:28px 36px 8px 36px;font-family:${FONT};">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="${RED}" style="background-color:${RED};background-image:${GRADIENT};border-radius:14px;"><a href="${safeLink}" style="display:inline-block;padding:16px 38px;font-family:${FONT};font-size:17px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:14px;">Reprendre mon compte</a></td></tr></table>
<p style="margin:10px 0 0 0;font-size:13px;color:#64748b;">Un clic, sans mot de passe.</p>
</td></tr>

<tr><td style="padding:28px 36px 4px 36px;font-family:${FONT};">
<p style="margin:0 0 16px 0;font-size:12px;font-weight:700;letter-spacing:0.16em;color:${MAGENTA};">EN 5 ÉTAPES</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${stepsHtml}
</table>
</td></tr>

<tr><td style="padding:4px 36px 28px 36px;font-family:${FONT};">
<p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">Aucune carte bancaire n'est demandée à l'activation.<br>Ce lien est personnel : ne le transférez pas. Le bouton ne fonctionne pas ? Copiez cette adresse dans votre navigateur :<br><span style="word-break:break-all;color:${MAGENTA_DEEP};">${safeLink}</span></p>
</td></tr>

<tr><td bgcolor="${MAGENTA_DARK}" style="background-color:${MAGENTA_DARK};padding:22px 36px;font-family:${FONT};">
<p style="margin:0 0 8px 0;font-size:13px;font-weight:700;color:#ffffff;">HARX<span style="font-weight:400;"> - We inspire growth</span></p>
<p style="margin:0;font-size:12px;line-height:1.6;color:#fbcfe8;">Vous recevez cet e-mail car vous avez créé un compte sur HARX. Pour ne plus en recevoir, répondez STOP à ce message.<br>${escapeHtml(POSTAL_ADDRESS)}</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>
`;

  return { subject: SUBJECT, text, html };
}
