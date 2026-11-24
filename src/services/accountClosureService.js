import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User.js';
import CompanyMembership from '../models/CompanyMembership.js';
import AgentInvitation from '../models/AgentInvitation.js';
import AgentShift from '../models/AgentShift.js';
import AgentListenGrant from '../models/AgentListenGrant.js';
import CallCenterBranding from '../models/CallCenterBranding.js';
import CallCenterClient from '../models/CallCenterClient.js';
import CallCenterClientAccess from '../models/CallCenterClientAccess.js';
import CallCenterOnboardingFeedback from '../models/CallCenterOnboardingFeedback.js';
import CallCenterOperationClient from '../models/CallCenterOperationClient.js';
import CallCenterOperationProfile from '../models/CallCenterOperationProfile.js';
import CallCenterWorkspaceState from '../models/CallCenterWorkspaceState.js';
import ScheduleRequest from '../models/ScheduleRequest.js';
import CountryWaitlist from '../models/CountryWaitlist.js';
import { ACCOUNT_DELETIONS_COLLECTION, forgetAccountState, isProtectedAccount } from './accountGate.js';
import { sendAppEmail } from './brevoMail.js';
import { accountDeletedEmail } from '../utils/harxMessages.js';

/**
 * Désactivation (réversible) et suppression (définitive) d'un compte — maquettes A2, A2b, A3 (admin) et B4 (l'abonné lui-même).
 *
 * Désactiver : connexion refusée tout de suite (jetons déjà émis compris, accountGate.js) ; abonnement Stripe et numéro NON modifiés.
 * Supprimer, dans cet ordre (rien n'est effacé ici si l'orchestrateur échoue : on peut recommencer) :
 *  1. l'orchestrateur (v25_comporchestrator_back, POST /api/internal/accounts/purge, jeton de service `account-purge`) résilie tout de
 *     suite l'abonnement Stripe (résiliation volontaire, sans remboursement), remet le(s) numéro(s) en stock et efface les données du
 *     compte qu'il détient (contacts, journal d'appels, répondeur, pièces d'identité, minutes et jetons) ;
 *  2. une ligne SANS donnée personnelle est écrite au journal `account_deletions` (qui, quand) : elle ferme aussi les jetons déjà émis ;
 *  3. les données de ce service sont effacées (société, accès, équipe), puis le compte : l'email est libre pour une nouvelle inscription ;
 *  4. un e-mail de confirmation est envoyé à l'adresse supprimée (même canal que les e-mails d'inscription) : son échec est journalisé
 *     et ne fait jamais échouer la suppression (`confirmationEmailSent: false`).
 */
export const ADMIN_AUDIT_COLLECTION = 'admin_audit_log';
export const ACCOUNT_PURGE_SCOPE = 'account-purge';
const PURGE_TIMEOUT_MS = 90 * 1000;
const REASON_MAX = 500;

export class AccountClosureError extends Error {
  constructor(status, code, message = code) {
    super(message);
    this.statusCode = status;
    this.code = code;
  }
}

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/** Adresse de l'orchestrateur : COMPORCHESTRATOR_URL, sinon la variable de service Railway du même projet. Sans « /api » final. */
export function orchestratorOrigin(env = process.env) {
  const explicit = env.COMPORCHESTRATOR_URL;
  const railway = env.RAILWAY_SERVICE_V25_COMPORCHESTRATOR_BACK_URL;
  const raw = explicit || (railway ? (/^https?:\/\//i.test(railway) ? railway : `https://${railway}`) : '');
  return String(raw).trim().replace(/\/+$/, '').replace(/\/api$/, '');
}

const defaultDeps = () => ({
  findUser: (userId) => (mongoose.Types.ObjectId.isValid(String(userId)) ? User.findById(userId) : null),
  ownedCompanyIds: async (userId) => {
    const rows = await mongoose.connection.db.collection('companies')
      .find({ userId: { $in: [oid(userId), String(userId)] } }).project({ _id: 1 }).toArray();
    return rows.map((r) => String(r._id));
  },
  /** Autres comptes rattachés à ces sociétés (équipe, agents) : la suppression d'un centre avec une équipe n'est pas prévue ici. */
  otherMembersCount: async (companyIds, userId) => {
    if (!companyIds.length) return 0;
    const ids = companyIds.map(oid);
    const [agents, members] = await Promise.all([
      User.countDocuments({ _id: { $ne: oid(userId) }, $or: [{ employerCompanyId: { $in: ids } }, { 'employments.companyId': { $in: ids } }] }),
      CompanyMembership.countDocuments({ companyId: { $in: ids }, userId: { $ne: oid(userId) } }),
    ]);
    return agents + members;
  },
  purgeOrchestrator: async ({ userId, companyIds }) => {
    const origin = orchestratorOrigin();
    const secret = process.env.JWT_SECRET;
    if (!origin || !secret) throw new AccountClosureError(503, 'ACCOUNT_PURGE_NOT_CONFIGURED', 'Account deletion is not configured');
    const token = jwt.sign({ scope: ACCOUNT_PURGE_SCOPE }, secret, { expiresIn: 120, algorithm: 'HS256' });
    let res;
    try {
      res = await fetch(`${origin}/api/internal/accounts/purge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: String(userId), companyIds }),
        signal: AbortSignal.timeout(PURGE_TIMEOUT_MS),
      });
    } catch (err) {
      throw new AccountClosureError(502, 'ACCOUNT_PURGE_FAILED', `Orchestrator unreachable: ${err?.message || err}`);
    }
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.success) {
      throw new AccountClosureError(502, 'ACCOUNT_PURGE_FAILED', body?.code || body?.error || `Orchestrator status ${res.status}`);
    }
    return body.data || {};
  },
  recordDeletion: (entry) => mongoose.connection.db.collection(ACCOUNT_DELETIONS_COLLECTION).insertOne(entry),
  recordAudit: (entry) => mongoose.connection.db.collection(ADMIN_AUDIT_COLLECTION).insertOne(entry),
  deleteRegistrationData: async ({ userId, email, companyIds }) => {
    const u = oid(userId);
    const ids = companyIds.map(oid);
    const byCompany = { companyId: { $in: ids } };
    const ops = [
      CompanyMembership.deleteMany({ $or: [{ userId: u }, ...(ids.length ? [byCompany] : [])] }),
      AgentInvitation.deleteMany({ $or: [{ userId: u }, ...(ids.length ? [byCompany] : [])] }),
      AgentShift.deleteMany({ $or: [{ userId: u }, ...(ids.length ? [byCompany] : [])] }),
      AgentListenGrant.deleteMany({ $or: [{ userId: u }, ...(ids.length ? [byCompany] : [])] }),
      CallCenterClientAccess.deleteMany({ $or: [{ userId: u }, ...(ids.length ? [byCompany] : [])] }),
      CallCenterOnboardingFeedback.deleteMany({ $or: [{ userId: u }, ...(ids.length ? [byCompany] : [])] }),
      CallCenterWorkspaceState.deleteMany({ $or: [{ userId: u }, ...(ids.length ? [byCompany] : [])] }),
      ScheduleRequest.deleteMany({ $or: [{ userId: u }, ...(ids.length ? [byCompany] : [])] }),
      CountryWaitlist.deleteMany({ email: String(email || '').toLowerCase() }),
    ];
    if (ids.length) {
      ops.push(
        CallCenterBranding.deleteMany(byCompany),
        CallCenterClient.deleteMany(byCompany),
        CallCenterOperationClient.deleteMany(byCompany),
        CallCenterOperationProfile.deleteMany(byCompany),
      );
    }
    await Promise.all(ops);
    if (companyIds.length) {
      await mongoose.connection.db.collection('companies').deleteMany({ _id: { $in: ids } });
    }
    const r = await User.deleteOne({ _id: u });
    return { userDeleted: r.deletedCount === 1 };
  },
  /** E-mail de confirmation (Brevo, sinon SMTP : sendAppEmail, comme les e-mails d'inscription). */
  sendDeletionEmail: async ({ email, numbers, byAdmin }) => {
    const message = accountDeletedEmail({ email, numbers, byAdmin });
    await sendAppEmail({ to: email, subject: message.subject, text: message.text, html: message.html });
  },
  log: (...args) => console.error(...args),
  now: () => new Date(),
});

function cleanReason(reason) {
  const r = String(reason ?? '').trim();
  return r ? r.slice(0, REASON_MAX) : null;
}

function guardTarget(user) {
  if (!user) throw new AccountClosureError(404, 'USER_NOT_FOUND', 'User not found');
  if (isProtectedAccount(user.email)) throw new AccountClosureError(403, 'PROTECTED_ACCOUNT', 'This account cannot be disabled or deleted');
  if (user.typeUser === 'admin') throw new AccountClosureError(400, 'ADMIN_ACCOUNT', 'Administrator accounts cannot be disabled or deleted here');
}

const sameEmail = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase() && String(a || '').trim() !== '';

export function createAccountClosureService(overrides = {}) {
  const d = { ...defaultDeps(), ...overrides };

  return {
    /**
     * Désactive (`disabled: true`) ou réactive un compte. `admin` : `{ userId, name }` de l'administrateur (jeton).
     * Effet immédiat : le cache d'état du compte est vidé sur ce serveur (l'orchestrateur le relit en quelques secondes).
     */
    async setDisabled({ userId, disabled, reason, admin }) {
      if (typeof disabled !== 'boolean') throw new AccountClosureError(400, 'INVALID_STATUS', '`disabled` must be a boolean');
      const user = await d.findUser(userId);
      guardTarget(user);
      const at = d.now();
      if (disabled) {
        user.disabled = true;
        user.disabledAt = at;
        user.disabledReason = cleanReason(reason);
        user.disabledBy = { userId: admin?.userId && mongoose.Types.ObjectId.isValid(String(admin.userId)) ? oid(admin.userId) : null, name: admin?.name || null };
      } else {
        user.disabled = false;
        user.disabledAt = null;
        user.disabledReason = null;
        user.disabledBy = { userId: null, name: null };
      }
      await user.save();
      forgetAccountState(userId);
      await d.recordAudit({
        action: disabled ? 'account_disabled' : 'account_enabled',
        targetUserId: String(userId),
        adminId: admin?.userId ? String(admin.userId) : null,
        reason: disabled ? cleanReason(reason) : null,
        at,
      });
      return {
        userId: String(userId),
        disabled: user.disabled,
        disabledAt: user.disabledAt,
        disabledReason: user.disabledReason,
        disabledBy: user.disabled ? { name: user.disabledBy?.name || null } : null,
      };
    },

    /**
     * Supprime définitivement un compte. `actor` : `{ type: 'admin', userId }` (l'admin a retapé l'email : `confirmEmail`) ou
     * `{ type: 'self' }` (l'abonné a saisi son email et son mot de passe : `email`, `password`).
     */
    async deleteAccount({ userId, actor, confirmEmail, email, password }) {
      const user = await d.findUser(userId);
      if (!user) throw new AccountClosureError(404, 'USER_NOT_FOUND', 'User not found');
      if (actor?.type === 'self') {
        const passwordOk = sameEmail(email, user.email) && typeof password === 'string' && password !== '' && (await user.comparePassword(password));
        if (!passwordOk) throw new AccountClosureError(403, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
      } else if (actor?.type === 'admin') {
        if (!sameEmail(confirmEmail, user.email)) throw new AccountClosureError(400, 'CONFIRMATION_MISMATCH', 'The typed email does not match the account');
      } else {
        throw new AccountClosureError(403, 'FORBIDDEN', 'Forbidden');
      }
      guardTarget(user);

      const companyIds = await d.ownedCompanyIds(user._id);
      if ((await d.otherMembersCount(companyIds, user._id)) > 0) {
        throw new AccountClosureError(409, 'COMPANY_HAS_MEMBERS', 'This account owns a company with other members');
      }

      const purge = await d.purgeOrchestrator({ userId: String(user._id), companyIds });

      const at = d.now();
      const summary = {
        companies: companyIds.length,
        subscriptionsCanceled: Array.isArray(purge.subscriptionsCanceled) ? purge.subscriptionsCanceled.length : 0,
        numbersReturned: Array.isArray(purge.numbersReturned) ? purge.numbersReturned.length : 0,
      };
      // Journal sans donnée personnelle (ni nom, ni email, ni numéro) : qui a supprimé, quand.
      await d.recordDeletion({
        userId: String(user._id),
        at,
        actor: actor.type === 'admin' ? { type: 'admin', adminId: actor.userId ? String(actor.userId) : null } : { type: 'self' },
        ...summary,
      });
      const deletedEmail = user.email;
      await d.deleteRegistrationData({ userId: String(user._id), email: deletedEmail, companyIds });
      forgetAccountState(user._id);
      // Après la suppression réussie seulement : confirmation à l'adresse supprimée. Un échec d'envoi ne change rien à la suppression.
      let confirmationEmailSent = false;
      try {
        await d.sendDeletionEmail({
          email: deletedEmail,
          numbers: Array.isArray(purge.numbersReturned) ? purge.numbersReturned.map(String) : [],
          byAdmin: actor.type === 'admin',
        });
        confirmationEmailSent = true;
      } catch (err) {
        // Sans donnée personnelle dans le journal : l'identifiant du compte seulement.
        d.log(`[account-closure] e-mail de confirmation non envoyé (compte ${String(user._id)}) : ${err?.message || err}`);
      }
      return { userId: String(user._id), deletedAt: at, ...summary, emailFreed: true, confirmationEmailSent };
    },
  };
}

export const accountClosureService = createAccountClosureService();

/** Réponse HTTP d'une erreur du service (code stable pour les écrans). */
export function sendClosureError(res, error) {
  if (error instanceof AccountClosureError) {
    return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
  }
  console.error('[account-closure]', error?.message || error);
  return res.status(500).json({ success: false, code: 'ACCOUNT_CLOSURE_FAILED', message: 'Account operation failed' });
}
