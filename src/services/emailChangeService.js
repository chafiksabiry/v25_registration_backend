// Changement d'e-mail de connexion (2 étapes). Les dépendances sont injectées
// pour pouvoir tester sans MongoDB ni envoi réel d'e-mails.

export class EmailChangeError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const REQUEST_LIMIT = 5;
export const REQUEST_WINDOW_MS = 60 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;
export const CODE_TTL_MS = 15 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generate6DigitCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function createEmailChangeService({
  findUserById,
  findUserByEmail,
  sendVerificationEmail,
  sendEmailChangedNotice,
  signToken,
  now = () => Date.now(),
}) {
  // Mémoire du process : userId -> horodatages des demandes récentes.
  const requestLog = new Map();

  function checkRateLimit(userId) {
    const t = now();
    const recent = (requestLog.get(String(userId)) || []).filter((x) => t - x < REQUEST_WINDOW_MS);
    if (recent.length >= REQUEST_LIMIT) {
      requestLog.set(String(userId), recent);
      throw new EmailChangeError(429, 'rate_limited', 'Trop de demandes. Réessayez plus tard.');
    }
    recent.push(t);
    requestLog.set(String(userId), recent);
  }

  async function requestEmailChange(userId, { newEmail, currentPassword } = {}) {
    if (!userId) throw new EmailChangeError(400, 'invalid_request', 'Identifiant utilisateur requis.');
    const user = await findUserById(userId);
    if (!user) throw new EmailChangeError(404, 'user_not_found', 'Utilisateur introuvable.');

    checkRateLimit(user._id);

    if (user.password) {
      const ok = typeof currentPassword === 'string' && currentPassword.length > 0
        && await user.comparePassword(currentPassword);
      if (!ok) throw new EmailChangeError(401, 'invalid_password', 'Mot de passe incorrect.');
    }

    const email = typeof newEmail === 'string' ? newEmail.trim().toLowerCase() : '';
    if (!email || !EMAIL_RE.test(email)) {
      throw new EmailChangeError(400, 'invalid_email', 'Adresse e-mail invalide.');
    }
    if (String(user.email || '').toLowerCase() === email) {
      throw new EmailChangeError(400, 'same_email', "Le nouvel e-mail doit différer de l'e-mail actuel.");
    }
    const conflict = await findUserByEmail(email, user._id);
    if (conflict) {
      throw new EmailChangeError(409, 'email_taken', 'Cette adresse e-mail est déjà utilisée par un autre compte.');
    }

    const code = generate6DigitCode();
    user.pendingChanges = user.pendingChanges || {};
    user.pendingChanges.emailChange = {
      newEmail: email,
      code,
      expiresAt: new Date(now() + CODE_TTL_MS),
      attempts: 0,
    };
    await user.save();

    try {
      await sendVerificationEmail(email, code);
    } catch (error) {
      throw new EmailChangeError(502, 'email_send_failed', "Impossible d'envoyer le code de vérification.");
    }
    return { success: true, message: 'Code de vérification envoyé au nouvel e-mail.' };
  }

  async function confirmEmailChange(userId, { code } = {}) {
    if (!userId) throw new EmailChangeError(400, 'invalid_request', 'Identifiant utilisateur requis.');
    if (!code || typeof code !== 'string') {
      throw new EmailChangeError(400, 'invalid_code', 'Code de vérification requis.');
    }
    const user = await findUserById(userId);
    if (!user) throw new EmailChangeError(404, 'user_not_found', 'Utilisateur introuvable.');

    const pending = user.pendingChanges?.emailChange;
    if (!pending?.newEmail || !pending?.code) {
      throw new EmailChangeError(400, 'no_pending_change', 'Aucun changement en attente : demandez un nouveau code.');
    }
    if (pending.expiresAt && now() > new Date(pending.expiresAt).getTime()) {
      user.pendingChanges.emailChange = undefined;
      await user.save();
      throw new EmailChangeError(400, 'code_expired', 'Le code a expiré : demandez-en un nouveau.');
    }
    if (String(pending.code) !== code.trim()) {
      const attempts = (pending.attempts || 0) + 1;
      if (attempts >= MAX_CODE_ATTEMPTS) {
        user.pendingChanges.emailChange = undefined;
        await user.save();
        throw new EmailChangeError(429, 'too_many_attempts', 'Trop de tentatives : le code a été invalidé. Demandez-en un nouveau.');
      }
      user.pendingChanges.emailChange.attempts = attempts;
      await user.save();
      throw new EmailChangeError(401, 'invalid_code', 'Code de vérification incorrect.');
    }

    // Unicité revérifiée au moment de la bascule
    const conflict = await findUserByEmail(pending.newEmail, user._id);
    if (conflict) {
      user.pendingChanges.emailChange = undefined;
      await user.save();
      throw new EmailChangeError(409, 'email_taken', 'Cette adresse e-mail est déjà utilisée par un autre compte.');
    }

    const oldEmail = user.email;
    user.email = pending.newEmail;
    user.pendingChanges.emailChange = undefined;
    await user.save();

    if (oldEmail && sendEmailChangedNotice) {
      try {
        await sendEmailChangedNotice(oldEmail, user.email);
      } catch (error) {
        console.error('Email change notice failed:', error.message);
      }
    }

    return {
      success: true,
      data: {
        _id: user._id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        token: signToken(user),
      },
    };
  }

  return { requestEmailChange, confirmEmailChange };
}
