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

export function verificationSms(code) {
  return (
    `HARX\n` +
    `Code de verification : ${code}\n` +
    `Valable 5 minutes. Ne le partagez avec personne.`
  );
}
