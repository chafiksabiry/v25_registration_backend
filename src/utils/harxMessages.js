import { frInCountry } from './frCountryPreposition.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function publicApiBase() {
  return (
    process.env.PUBLIC_API_URL ||
    process.env.REGISTRATION_PUBLIC_URL ||
    'https://v25registrationbackend-production.up.railway.app'
  ).replace(/\/$/, '');
}

function harxEmailShell({ eyebrow, title, intro, bodyHtml, footer }) {
  const logoUrl = escapeHtml(`${publicApiBase()}/email/logo-pink.png`);
  return `<!DOCTYPE html>
<html lang="fr">
  <body style="margin:0;padding:0;background-color:#fff1f2;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#fff1f2" style="background-color:#fff1f2;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #fecdd3;">
            <tr>
              <td align="center" bgcolor="#ec4899" style="background-color:#ec4899;padding:0;line-height:0;font-size:0;">
                <img src="${logoUrl}" width="560" alt="HARX" style="display:block;width:100%;max-width:560px;height:auto;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="padding:28px 28px 8px;font-family:Segoe UI,Tahoma,sans-serif;">
                <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.16em;color:#e11d48;">${eyebrow}</p>
                <h1 style="margin:0 0 10px;font-size:24px;line-height:1.25;color:#0f172a;">${title}</h1>
                <p style="margin:0;font-size:15px;line-height:1.6;color:#64748b;">${intro}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 28px 8px;font-family:Segoe UI,Tahoma,sans-serif;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td bgcolor="#fff7f8" style="background-color:#fff7f8;padding:18px 28px 22px;border-top:1px solid #ffe4e6;font-family:Segoe UI,Tahoma,sans-serif;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#9f1239;">${footer}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function verificationEmail({ code }) {
  const safeCode = escapeHtml(code);
  return {
    subject: 'HARX — Votre code de vérification',
    text:
      `HARX\n\n` +
      `Votre code de vérification : ${code}\n` +
      `Il expire dans 10 minutes. Ne le partagez avec personne.`,
    html: harxEmailShell({
      eyebrow: 'INSCRIPTION',
      title: 'Vérifiez votre e-mail',
      intro: 'Utilisez ce code pour confirmer votre adresse et continuer sur HARX.',
      bodyHtml: `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#fff1f2" style="background-color:#fff1f2;border:1px solid #fecdd3;border-radius:18px;">
          <tr>
            <td align="center" style="padding:22px 16px 10px;font-family:Segoe UI,Tahoma,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.18em;color:#be123c;">
              CODE DE VÉRIFICATION
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 16px 22px;">
              <table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #fda4af;border-radius:14px;">
                <tr>
                  <td align="center" style="padding:16px 32px;font-family:Segoe UI,Tahoma,sans-serif;font-size:32px;font-weight:800;letter-spacing:0.22em;color:#9f1239;">
                    ${safeCode}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `,
      footer: 'Ce code expire dans 10 minutes. Ne le partagez avec personne.',
    }),
  };
}

export function inviteEmail({ firstName, email, tempPassword, companyName, loginUrl }) {
  const safeName = escapeHtml(firstName || 'there');
  const org = escapeHtml(companyName || 'your call center');
  const safeEmail = escapeHtml(email);
  const safePassword = escapeHtml(tempPassword);
  const safeUrl = escapeHtml(loginUrl);
  return {
    subject: `HARX — Invitation à rejoindre ${companyName || 'votre centre'}`,
    html: harxEmailShell({
      eyebrow: 'INVITATION',
      title: 'Bienvenue sur HARX',
      intro: `Bonjour ${safeName}, ${org} a créé votre compte agent. Connectez-vous avec les identifiants ci-dessous, puis changez votre mot de passe.`,
      footer: 'Pour votre sécurité, changez ce mot de passe dès la première connexion.',
      bodyHtml: `
        <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:16px;padding:16px 18px;margin:0 0 22px;">
          <p style="margin:0 0 8px;font-size:14px;color:#1e293b;"><strong>E-mail :</strong> ${safeEmail}</p>
          <p style="margin:0;font-size:14px;color:#1e293b;"><strong>Mot de passe temporaire :</strong> ${safePassword}</p>
        </div>
        <p style="margin:0;text-align:center;">
          <a href="${safeUrl}" style="display:inline-block;background-color:#ec4899;background-image:linear-gradient(90deg,#ff4d4d 0%,#ec4899 100%);color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:700;">Se connecter</a>
        </p>
      `,
    }),
  };
}

export function countryWaitlistEmail({ countryName, countryCode, locale }) {
  const en = String(locale || '').toLowerCase().startsWith('en');
  const country = escapeHtml(countryName);
  const inCountryFr = frInCountry(countryCode, country);
  return {
    subject: en ? `HARX Telephony — you are on the list for ${countryName}` : `HARX Telephony — vous êtes sur la liste pour ${countryName}`,
    html: harxEmailShell({
      eyebrow: en ? 'WAITING LIST · TELEPHONY' : 'LISTE D\'ATTENTE · TELEPHONY',
      title: en ? 'Thank you, we noted your interest' : 'Merci, votre demande est enregistrée',
      intro: en
        ? `HARX Telephony is not yet open in ${country}. We have registered your address and will write to you once it is available. Nothing is billed and no account has been created.`
        : `HARX Telephony n'est pas encore ouvert ${inCountryFr}. Nous avons enregistré votre adresse et vous écrirons dès l'ouverture. Rien n'est facturé et aucun compte n'a été créé.`,
      footer: en ? 'If you did not make this request, simply ignore this message.' : 'Si vous n\'êtes pas à l\'origine de cette demande, ignorez simplement ce message.',
      bodyHtml: '',
    }),
  };
}

const NUMBERS_WAITLIST_TEXT = {
  fr: {
    // `c` est déjà précédé de sa préposition (« au Maroc », « aux États-Unis », « en France »…).
    subject: (c) => `HARX Nomad — nous vous prévenons dès qu'un numéro est disponible ${c}`,
    eyebrow: 'LISTE D\'ATTENTE · NUMÉRO',
    title: 'Merci, votre demande est enregistrée',
    intro: (c) => `Aucun numéro n'est encore disponible ${c}. Nous vous prévenons dès qu'il y en a un. Votre compte HARX est bien créé.`,
    footer: 'Si vous n\'êtes pas à l\'origine de cette demande, ignorez simplement ce message.',
  },
  en: {
    subject: (c) => `HARX Nomad — we will notify you as soon as a number is available in ${c}`,
    eyebrow: 'WAITING LIST · NUMBER',
    title: 'Thank you, your request is registered',
    intro: (c) => `No number is available yet in ${c}; we will notify you as soon as one is. Your HARX account is already created.`,
    footer: 'If you did not make this request, simply ignore this message.',
  },
  es: {
    subject: (c) => `HARX Nomad — le avisaremos en cuanto haya un número disponible en ${c}`,
    eyebrow: 'LISTA DE ESPERA · NÚMERO',
    title: 'Gracias, su solicitud está registrada',
    intro: (c) => `Todavía no hay ningún número disponible en ${c}; le avisaremos en cuanto haya uno. Su cuenta HARX ya está creada.`,
    footer: 'Si no ha realizado esta solicitud, ignore este mensaje.',
  },
  ar: {
    subject: (c) => `HARX Nomad — سنُعلمك فور توفر رقم في ${c}`,
    eyebrow: 'قائمة الانتظار · رقم',
    title: 'شكرًا، تم تسجيل طلبك',
    intro: (c) => `لا يتوفر أي رقم بعد في ${c}؛ سنُعلمك فور توفر رقم. حسابك في HARX منشأ بالفعل.`,
    footer: 'إذا لم تقدّم هذا الطلب، فتجاهل هذه الرسالة.',
  },
};

/** Abonné Nomad Solo (compte déjà créé) en attente d'un numéro dans son pays : ni « pays pas encore ouvert », ni « aucun compte créé ». */
export function numbersWaitlistEmail({ countryName, countryCode, locale }) {
  const lang = String(locale || '').toLowerCase().slice(0, 2);
  const isFr = !NUMBERS_WAITLIST_TEXT[lang] || lang === 'fr';
  const t = NUMBERS_WAITLIST_TEXT[lang] || NUMBERS_WAITLIST_TEXT.fr;
  const where = (name) => (isFr ? frInCountry(countryCode, name) : name);
  return {
    subject: t.subject(where(countryName)),
    html: harxEmailShell({
      eyebrow: t.eyebrow,
      title: t.title,
      intro: t.intro(where(escapeHtml(countryName))),
      footer: t.footer,
      bodyHtml: '',
    }),
  };
}

export function agentInvitationNoticeEmail({ firstName, companyName, loginUrl }) {
  const safeName = escapeHtml(firstName || '');
  const org = escapeHtml(companyName || 'un centre d\'appels');
  const safeUrl = escapeHtml(loginUrl);
  return {
    subject: `HARX — ${companyName || 'Un centre d\'appels'} vous invite à le rejoindre`,
    html: harxEmailShell({
      eyebrow: 'INVITATION',
      title: 'Vous êtes invité sur HARX',
      intro: `Bonjour ${safeName}, ${org} vous invite à rejoindre son équipe. Vous avez déjà un compte HARX : le bouton ci-dessous vous connecte directement, puis vous pouvez accepter l'invitation.`,
      footer: 'Si vous n\'êtes pas à l\'origine de cette invitation ou si vous ne connaissez pas ce centre, ignorez ce message ou refusez l\'invitation après connexion.',
      bodyHtml: `
        <p style="margin:0;text-align:center;">
          <a href="${safeUrl}" style="display:inline-block;background-color:#ec4899;background-image:linear-gradient(90deg,#ff4d4d 0%,#ec4899 100%);color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:700;">Se connecter et répondre</a>
        </p>
      `,
    }),
  };
}

export function companyMemberInviteEmail({ firstName, email, tempPassword, companyName, loginUrl, roleName, accessLines, accessLinesEn }) {
  const safeName = escapeHtml(firstName || '');
  const org = escapeHtml(companyName || 'HARX');
  const safeEmail = escapeHtml(email);
  const safePassword = tempPassword ? escapeHtml(tempPassword) : '';
  const safeUrl = escapeHtml(loginUrl);
  const safeRole = escapeHtml(roleName || 'Membre');
  const toList = (items, empty) => {
    const lines = Array.isArray(items) ? items.map((line) => String(line || '').trim()).filter(Boolean) : [];
    return lines.length
      ? `<ul style="margin:8px 0 0;padding:0 0 0 18px;color:#1e293b;font-size:14px;line-height:1.6;">${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
      : `<p style="margin:8px 0 0;font-size:14px;color:#1e293b;">${empty}</p>`;
  };
  const accessHtml = toList(accessLines, 'Aucun accès n\'est ouvert pour le moment.');
  const accessHtmlEn = toList(accessLinesEn, 'No access is open yet.');
  const credentials = safePassword
    ? `
        <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:16px;padding:16px 18px;margin:0 0 22px;">
          <p style="margin:0 0 8px;font-size:14px;color:#1e293b;"><strong>E-mail :</strong> ${safeEmail}</p>
          <p style="margin:0;font-size:14px;color:#1e293b;"><strong>Mot de passe temporaire :</strong> ${safePassword}</p>
        </div>`
    : `
        <p style="margin:0 0 22px;font-size:14px;color:#1e293b;">Connectez-vous avec votre e-mail <strong>${safeEmail}</strong> et votre mot de passe habituel.</p>`;
  return {
    subject: `HARX — ${companyName || 'Une entreprise'} vous invite comme ${roleName || 'membre'}`,
    html: harxEmailShell({
      eyebrow: 'INVITATION',
      title: 'Vous rejoignez une entreprise HARX',
      intro: `Bonjour ${safeName}, ${org} vous invite à accéder à son espace avec le rôle ${safeRole}. Voici ce que vous pouvez ouvrir.<br><br>Hello ${safeName}, ${org} invites you to its workspace with the role ${safeRole}. Here is what you can open.`,
      footer: safePassword
        ? 'Pour votre sécurité, changez ce mot de passe dès la première connexion.'
        : 'Si vous n\'êtes pas à l\'origine de cette invitation, ignorez ce message.',
      bodyHtml: `
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:16px 18px;margin:0 0 22px;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.08em;color:#e11d48;">VOTRE RÔLE</p>
          <p style="margin:6px 0 0;font-size:16px;font-weight:700;color:#0f172a;">${safeRole}</p>
          ${accessHtml}
          <p style="margin:16px 0 0;font-size:12px;font-weight:700;letter-spacing:0.08em;color:#e11d48;">YOUR ROLE</p>
          <p style="margin:6px 0 0;font-size:16px;font-weight:700;color:#0f172a;">${safeRole}</p>
          ${accessHtmlEn}
        </div>
        ${credentials}
        <p style="margin:0;text-align:center;">
          <a href="${safeUrl}" style="display:inline-block;background-color:#ec4899;background-image:linear-gradient(90deg,#ff4d4d 0%,#ec4899 100%);color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:700;">Se connecter</a>
        </p>
      `,
    }),
  };
}

const MEMBER_ROLES = {
  operator: { label: 'Manager', text: 'Crée et pilote les opérations : prospects, scripts, base de connaissance, téléphonie et appels. Sans facturation ni gestion de l’équipe.' },
  admin: { label: 'Administrateur', text: 'Tous les droits, y compris la facturation et la gestion de l’équipe.' },
  readonly: { label: 'Consultation', text: 'Voit tout, ne modifie rien.' },
};

const withProduct = (url) => (String(url).includes('?') ? url : `${url}?product=callcentre`);

/**
 * Invitation à rejoindre l'équipe d'un centre d'appels (manager, administrateur, consultation).
 * Compte existant : se connecter puis accepter. Nouveau compte : mot de passe temporaire à changer.
 */
export function teamMemberInvitationEmail({ firstName, companyName, preset, inviterName, email, tempPassword, loginUrl, roleName, accessLines, accessLinesEn }) {
  const baseRole = MEMBER_ROLES[String(preset || '').toLowerCase()] || { label: 'Membre de l’équipe', text: 'Vos droits sont ceux choisis par l’administrateur du centre.' };
  const role = { ...baseRole, label: roleName || baseRole.label };
  const toList = (items) => {
    const lines = Array.isArray(items) ? items.map((line) => String(line || '').trim()).filter(Boolean) : [];
    return lines.length
      ? `<ul style="margin:8px 0 0;padding:0 0 0 18px;color:#1e293b;font-size:14px;line-height:1.6;">${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
      : '';
  };
  const accessHtml = toList(accessLines);
  const accessHtmlEn = toList(accessLinesEn);
  const name = escapeHtml(firstName || '');
  const org = escapeHtml(companyName || 'Un centre d’appels');
  const inviter = inviterName ? escapeHtml(inviterName) : '';
  const url = escapeHtml(withProduct(loginUrl));
  const hasPassword = Boolean(tempPassword);
  const steps = hasPassword
    ? ['Connectez-vous avec l’e-mail et le mot de passe temporaire ci-dessus.', 'Choisissez votre mot de passe personnel.', `Retrouvez l’espace de ${org} : tableau de bord, opérations, appels et équipe selon vos droits.`]
    : ['Connectez-vous avec votre e-mail et votre mot de passe HARX habituels.', 'Acceptez l’invitation de ' + org + '.', 'Retrouvez son espace : tableau de bord, opérations, appels et équipe selon vos droits.'];
  const credentials = hasPassword
    ? `<div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:16px;padding:14px 18px;margin:0 0 18px;">
          <p style="margin:0 0 6px;font-size:14px;color:#1e293b;"><strong>E-mail :</strong> ${escapeHtml(email)}</p>
          <p style="margin:0;font-size:14px;color:#1e293b;"><strong>Mot de passe temporaire :</strong> ${escapeHtml(tempPassword)}</p>
        </div>`
    : '';
  return {
    subject: `${companyName || 'Un centre d’appels'} vous invite à rejoindre son équipe sur HARX Telephony`,
    html: harxEmailShell({
      eyebrow: 'INVITATION · ÉQUIPE · TELEPHONY',
      title: `${name ? `${name}, r` : 'R'}ejoignez l’équipe de ${org}`,
      intro: `${org} vous invite sur <strong>HARX Telephony</strong>, la plateforme qui sert à piloter ses opérations d’appels${inviter ? ` (invitation de ${inviter})` : ''}.`,
      footer: hasPassword
        ? 'Pour votre sécurité, changez ce mot de passe dès la première connexion. Si vous ne connaissez pas ce centre, ignorez ce message.'
        : 'Si vous n’êtes pas à l’origine de cette invitation ou si vous ne connaissez pas ce centre, ignorez ce message ou refusez l’invitation après connexion.',
      bodyHtml: `
        <div style="border:1px solid #fecdd3;border-radius:16px;padding:14px 18px;margin:0 0 18px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.14em;color:#e11d48;">VOTRE RÔLE</p>
          <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#0f172a;">${escapeHtml(role.label)}</p>
          ${accessHtml
            ? `${accessHtml}
          <p style="margin:14px 0 4px;font-size:11px;font-weight:700;letter-spacing:0.14em;color:#e11d48;">YOUR ROLE</p>
          <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#0f172a;">${escapeHtml(role.label)}</p>
          ${accessHtmlEn}`
            : `<p style="margin:0;font-size:14px;line-height:1.5;color:#475569;">${escapeHtml(role.text)}</p>`}
        </div>
        ${credentials}
        <ol style="margin:0 0 22px;padding-left:20px;font-size:14px;line-height:1.7;color:#1e293b;">
          ${steps.map((t) => `<li>${t}</li>`).join('')}
        </ol>
        <p style="margin:0 0 6px;text-align:center;">
          <a href="${url}" style="display:inline-block;background-color:#ec4899;background-image:linear-gradient(90deg,#ff4d4d 0%,#ec4899 100%);color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:700;font-size:15px;">${hasPassword ? 'Me connecter' : 'Accepter l’invitation'}</a>
        </p>
      `,
    }),
  };
}

export function verificationSms(code) {
  return (
    `HARX\n` +
    `Code de verification : ${code}\n` +
    `Valable 5 minutes. Ne le partagez avec personne.`
  );
}

export function reengageLinkEmail({ link, hours = 24 }) {
  const safeLink = escapeHtml(link);
  const button = `
    <p style="margin:0 0 18px;text-align:center;">
      <a href="${safeLink}" style="display:inline-block;background-color:#ec4899;background-image:linear-gradient(90deg,#ff4d4d 0%,#ec4899 100%);color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:12px;font-weight:700;">Open my HARX space &middot; Ouvrir mon espace HARX</a>
    </p>
    <p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#64748b;">This link is personal and valid for ${hours} hours: please do not forward it. The button does not work? Copy this address into your browser:<br><span style="color:#be123c;word-break:break-all;">${safeLink}</span></p>
    <p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#64748b;">Ce lien est personnel et valable ${hours} heures : ne le transférez pas. Le bouton ne fonctionne pas ? Copiez cette adresse dans votre navigateur.</p>`;
  return {
    subject: 'Your HARX one-click link · Votre lien HARX en un clic',
    text:
      `HARX\n\n` +
      `Open your HARX space (one click, no password):\n${link}\n\n` +
      `This link is personal and valid for ${hours} hours. Do not forward it. If you did not ask for it, ignore this message.\n\n` +
      `Ouvrez votre espace HARX (un clic, sans mot de passe) :\n${link}\n\n` +
      `Ce lien est personnel et valable ${hours} heures. Ne le transférez pas. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
    html: harxEmailShell({
      eyebrow: 'YOUR REP SPACE · VOTRE ESPACE REP',
      title: 'Your HARX space is one click away',
      intro: 'You asked for your personal link. Votre lien personnel est prêt.',
      bodyHtml: button,
      footer: 'If you did not make this request, ignore this message. Si vous n\'êtes pas à l\'origine de cette demande, ignorez ce message.',
    }),
  };
}

/** Invitation d'un contact client au portail du centre (lecture seule) : le centre est nommé, pas HARX. */
export function clientPortalInvitationEmail({ firstName, email, tempPassword, centerName, clientName, loginUrl }) {
  const safeName = escapeHtml(firstName || '');
  const center = escapeHtml(centerName || 'Votre centre d\'appels');
  const client = escapeHtml(clientName || 'votre entreprise');
  const safeUrl = escapeHtml(loginUrl);
  const credentials = tempPassword
    ? `<div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:16px;padding:16px 18px;margin:0 0 22px;">
          <p style="margin:0 0 8px;font-size:14px;color:#1e293b;"><strong>E-mail :</strong> ${escapeHtml(email)}</p>
          <p style="margin:0;font-size:14px;color:#1e293b;"><strong>Mot de passe temporaire :</strong> ${escapeHtml(tempPassword)}</p>
        </div>`
    : '';
  return {
    subject: `${centerName || 'Votre centre d\'appels'} — accès à votre portail client`,
    html: harxEmailShell({
      eyebrow: 'PORTAIL CLIENT',
      title: 'Suivez votre activité',
      intro: `Bonjour ${safeName}, ${center} vous ouvre l'accès à « Mon activité » pour ${client} : les appels passés pour votre compte, leur durée et leur qualité. L'accès est en lecture seule.`,
      footer: 'Pour votre sécurité, changez ce mot de passe dès la première connexion. Si vous ne connaissez pas ce centre, ignorez ce message.',
      bodyHtml: `${credentials}
        <p style="margin:0;text-align:center;">
          <a href="${safeUrl}" style="display:inline-block;background-color:#ec4899;background-image:linear-gradient(90deg,#ff4d4d 0%,#ec4899 100%);color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:700;">Ouvrir mon portail</a>
        </p>`,
    }),
  };
}

/** Numéro E.164 lisible : +33 1 42 00 00 07 (France), sinon le numéro tel quel. */
function readableNumber(e164) {
  const n = String(e164 || '').trim();
  const fr = /^\+33(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(n);
  return fr ? `+33 ${fr.slice(1).join(' ')}` : n;
}

/** Offres dont le nom figure dans l'e-mail de suppression (jamais traduit, jamais mélangé) ; toute autre valeur : HARX seul. */
export const DELETION_EMAIL_PRODUCTS = ['nomad', 'cloud'];

/**
 * Confirmation de suppression du compte (après la suppression réussie), envoyée à l'adresse supprimée.
 * `byAdmin` : suppression par l'équipe HARX (maquette A3) ; sinon par l'abonné lui-même (B4).
 * `product` : offre du compte (« nomad » ou « cloud ») : « HARX NOMAD » / « HARX CLOUD » ; inconnue : « HARX » seul, neutre.
 * Même récapitulatif que l'écran « Votre compte a été supprimé » ; aucun lien qui demande une connexion (le compte n'existe plus).
 */
export function accountDeletedEmail({ email, numbers = [], byAdmin = false, product = null }) {
  const brand = DELETION_EMAIL_PRODUCTS.includes(product) ? `HARX ${String(product).toUpperCase()}` : 'HARX';
  const list = (Array.isArray(numbers) ? numbers : []).filter(Boolean).map(readableNumber);
  const number = list.join(', ');
  const title = byAdmin ? 'Votre compte a été supprimé par l\'équipe HARX' : 'Votre compte a été supprimé';
  const items = [
    'Votre abonnement est arrêté — plus aucun prélèvement.',
    number ? `Votre numéro ${number} est libéré.` : 'Votre numéro est libéré.',
    'Vos données sont effacées (contacts, journal d\'appels, messages, pièces d\'identité, minutes et jetons).',
    `Votre e-mail ${email} est libéré : vous pouvez créer un nouveau compte avec cette adresse.`,
  ];
  const intro = byAdmin
    ? `L'équipe HARX a supprimé votre compte ${brand}. Voici ce que cela signifie :`
    : `Vous avez supprimé votre compte ${brand}. Voici ce que cela signifie :`;
  const footer = 'Les factures déjà émises restent disponibles chez notre prestataire de paiement, comme la loi l\'exige. Une question ? Écrivez à support@harx.ai.';
  return {
    subject: `Votre compte ${brand} a été supprimé`,
    text:
      `${brand}\n\n${title}\n\n${intro}\n` +
      items.map((t) => `- ${t}`).join('\n') +
      `\n\n${footer}`,
    html: harxEmailShell({
      eyebrow: brand === 'HARX' ? 'COMPTE SUPPRIMÉ' : `${brand.slice(5)} · COMPTE SUPPRIMÉ`,
      title: escapeHtml(title),
      intro: escapeHtml(intro),
      bodyHtml: `
        <ul style="margin:0 0 8px;padding-left:20px;font-size:14px;line-height:1.7;color:#1e293b;">
          ${items.map((t) => `<li style="margin:0 0 6px;">${escapeHtml(t)}</li>`).join('')}
        </ul>
      `,
      footer: escapeHtml(footer),
    }),
  };
}
