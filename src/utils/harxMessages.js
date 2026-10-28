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

export function countryWaitlistEmail({ countryName, locale }) {
  const en = String(locale || '').toLowerCase().startsWith('en');
  const country = escapeHtml(countryName);
  return {
    subject: en ? `HARX Call Centre — you are on the list for ${countryName}` : `HARX Centre d'appels — vous êtes sur la liste pour ${countryName}`,
    html: harxEmailShell({
      eyebrow: en ? 'WAITING LIST' : 'LISTE D\'ATTENTE',
      title: en ? 'Thank you, we noted your interest' : 'Merci, votre demande est enregistrée',
      intro: en
        ? `HARX Call Centre is not yet open in ${country}. We have registered your address and will write to you once it is available. Nothing is billed and no account has been created.`
        : `HARX Centre d'appels n'est pas encore ouvert en ${country}. Nous avons enregistré votre adresse et vous écrirons dès l'ouverture. Rien n'est facturé et aucun compte n'a été créé.`,
      footer: en ? 'If you did not make this request, simply ignore this message.' : 'Si vous n\'êtes pas à l\'origine de cette demande, ignorez simplement ce message.',
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
      intro: `Bonjour ${safeName}, ${org} vous invite à rejoindre son équipe. Vous avez déjà un compte HARX : connectez-vous avec votre e-mail et votre mot de passe habituels, puis acceptez l'invitation.`,
      footer: 'Si vous n\'êtes pas à l\'origine de cette invitation ou si vous ne connaissez pas ce centre, ignorez ce message ou refusez l\'invitation après connexion.',
      bodyHtml: `
        <p style="margin:0;text-align:center;">
          <a href="${safeUrl}" style="display:inline-block;background-color:#ec4899;background-image:linear-gradient(90deg,#ff4d4d 0%,#ec4899 100%);color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:700;">Se connecter et répondre</a>
        </p>
      `,
    }),
  };
}

export function companyMemberInviteEmail({ firstName, email, tempPassword, companyName, loginUrl }) {
  const safeName = escapeHtml(firstName || '');
  const org = escapeHtml(companyName || 'HARX');
  const safeEmail = escapeHtml(email);
  const safePassword = tempPassword ? escapeHtml(tempPassword) : '';
  const safeUrl = escapeHtml(loginUrl);
  const credentials = safePassword
    ? `
        <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:16px;padding:16px 18px;margin:0 0 22px;">
          <p style="margin:0 0 8px;font-size:14px;color:#1e293b;"><strong>E-mail :</strong> ${safeEmail}</p>
          <p style="margin:0;font-size:14px;color:#1e293b;"><strong>Mot de passe temporaire :</strong> ${safePassword}</p>
        </div>`
    : `
        <p style="margin:0 0 22px;font-size:14px;color:#1e293b;">Connectez-vous avec votre e-mail <strong>${safeEmail}</strong> et votre mot de passe habituel.</p>`;
  return {
    subject: `HARX — Invitation à rejoindre ${companyName || 'une entreprise'}`,
    html: harxEmailShell({
      eyebrow: 'INVITATION',
      title: 'Vous rejoignez une entreprise HARX',
      intro: `Bonjour ${safeName}, ${org} vous invite à accéder à son espace. Vos droits sont limités à ce que l'administrateur a choisi.`,
      footer: safePassword
        ? 'Pour votre sécurité, changez ce mot de passe dès la première connexion.'
        : 'Si vous n\'êtes pas à l\'origine de cette invitation, ignorez ce message.',
      bodyHtml: `
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
export function teamMemberInvitationEmail({ firstName, companyName, preset, inviterName, email, tempPassword, loginUrl }) {
  const role = MEMBER_ROLES[String(preset || '').toLowerCase()] || { label: 'Membre de l’équipe', text: 'Vos droits sont ceux choisis par l’administrateur du centre.' };
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
    subject: `${companyName || 'Un centre d’appels'} vous invite à rejoindre son équipe sur HARX Call Centre`,
    html: harxEmailShell({
      eyebrow: 'INVITATION · ÉQUIPE',
      title: `${name ? `${name}, r` : 'R'}ejoignez l’équipe de ${org}`,
      intro: `${org} vous invite sur <strong>HARX Call Centre</strong>, la plateforme qui sert à piloter ses opérations d’appels${inviter ? ` (invitation de ${inviter})` : ''}.`,
      footer: hasPassword
        ? 'Pour votre sécurité, changez ce mot de passe dès la première connexion. Si vous ne connaissez pas ce centre, ignorez ce message.'
        : 'Si vous n’êtes pas à l’origine de cette invitation ou si vous ne connaissez pas ce centre, ignorez ce message ou refusez l’invitation après connexion.',
      bodyHtml: `
        <div style="border:1px solid #fecdd3;border-radius:16px;padding:14px 18px;margin:0 0 18px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.14em;color:#e11d48;">VOTRE RÔLE</p>
          <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#0f172a;">${escapeHtml(role.label)}</p>
          <p style="margin:0;font-size:14px;line-height:1.5;color:#475569;">${escapeHtml(role.text)}</p>
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
