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
import { DELETION_EMAIL_PRODUCTS, accountDeletedEmail } from '../utils/harxMessages.js';
import { getLastKnownCompanyProduct } from './companyProduct.js';
import { resolveAccountOfferDetail } from './accountOffer.js';

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
/** Suppression en masse (console d'administration) : au plus 50 comptes par lot, 3 suppressions à la fois. */
export const BULK_DELETE_MAX = 50;
const BULK_DELETE_CONCURRENCY = 3;
/** Refus attendus (le compte reste tel quel) ; toute autre erreur est un échec (« failed »), qu'on peut relancer. */
const BULK_REFUSED_CODES = new Set(['ACCOUNT_NOT_FOUND', 'PROTECTED_ACCOUNT', 'ADMIN_ACCOUNT', 'COMPANY_HAS_MEMBERS']);

/** Texte à taper pour confirmer un lot de `n` comptes : « SUPPRIMER n ». */
export const bulkConfirmText = (n) => `SUPPRIMER ${n}`;
const normalizeConfirm = (t) => String(t ?? '').trim().replace(/\s+/g, ' ');

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

/**
 * Offre d'un compte (« nomad » / « cloud ») d'après ses sociétés : dernier palier connu de l'abonnement (Nomad Solo = NOMAD, autres
 * paliers = CLOUD), sinon le profil enregistré par le portail (`accountProfile` : « solo » = NOMAD, « company » = CLOUD) ; null sinon.
 * Le détail (produit CLOUD, source) est donné par resolveAccountOfferDetail (accountOffer.js).
 */
export async function resolveAccountOffer(deps) {
  return (await resolveAccountOfferDetail(deps)).offer;
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
  /**
   * Offre du compte (« nomad » / « cloud ») d'après ses sociétés, lue AVANT la purge (l'abonnement est effacé ensuite) :
   * dernier palier connu de l'abonnement (Nomad Solo = NOMAD, autres paliers = CLOUD), sinon le profil enregistré par le portail
   * (`accountProfile` : « solo » = NOMAD, « company » = CLOUD). null si rien ne permet de le dire.
   */
  accountProduct: ({ companyIds, signup = null }) => resolveAccountOffer({
    companyIds,
    // Parcours d'entrée du compte : fait foi s'il est connu (accountOffer.js).
    signup,
    lastKnownTier: (id) => getLastKnownCompanyProduct(id, mongoose.connection.db),
    workspaceStates: (ids) => CallCenterWorkspaceState.find({ companyId: { $in: ids.map(oid) }, scope: 'company' }).lean(),
  }),
  /** E-mail de confirmation (Brevo, sinon SMTP : sendAppEmail, comme les e-mails d'inscription). */
  sendDeletionEmail: async ({ email, numbers, byAdmin, product }) => {
    const message = accountDeletedEmail({ email, numbers, byAdmin, product });
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

  const service = {
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
    async deleteAccount({ userId, actor, confirmEmail, email, password, product }) {
      const user = await d.findUser(userId);
      if (!user) throw new AccountClosureError(404, 'USER_NOT_FOUND', 'User not found');
      if (actor?.type === 'self') {
        const passwordOk = sameEmail(email, user.email) && typeof password === 'string' && password !== '' && (await user.comparePassword(password));
        if (!passwordOk) throw new AccountClosureError(403, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
      } else if (actor?.type === 'self-email-code') {
        // L'abonné a prouvé la possession de la boîte par un code e-mail à usage unique (services/accountDeletionCodeService.js),
        // vérifié AVANT cet appel : seule l'adresse doit correspondre. Utilisé par l'app mobile (comptes sans mot de passe connu).
        if (actor.verified !== true || !sameEmail(email, user.email)) throw new AccountClosureError(403, 'INVALID_CREDENTIALS', 'Email or code is incorrect');
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

      // Offre du compte pour l'e-mail de confirmation : celle envoyée par le portail (suppression par l'abonné), sinon lue avant la purge.
      // Une lecture en échec ne bloque jamais la suppression : e-mail neutre (« HARX »).
      let offer = (actor.type === 'self' || actor.type === 'self-email-code') && DELETION_EMAIL_PRODUCTS.includes(product) ? product : null;
      if (!offer) {
        try {
          offer = await d.accountProduct({ companyIds, signup: user.signup || null });
        } catch (err) {
          d.log(`[account-closure] offre du compte non lue (compte ${String(user._id)}) : ${err?.message || err}`);
        }
      }
      offer = DELETION_EMAIL_PRODUCTS.includes(offer) ? offer : null;

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
        actor: actor.type === 'admin'
          ? { type: 'admin', adminId: actor.userId ? String(actor.userId) : null, ...(actor.batchId ? { batchId: String(actor.batchId) } : {}) }
          : { type: 'self', ...(actor.type === 'self-email-code' ? { method: 'email-code' } : {}) },
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
          product: offer,
        });
        confirmationEmailSent = true;
      } catch (err) {
        // Sans donnée personnelle dans le journal : l'identifiant du compte seulement.
        d.log(`[account-closure] e-mail de confirmation non envoyé (compte ${String(user._id)}) : ${err?.message || err}`);
      }
      return { userId: String(user._id), deletedAt: at, ...summary, emailFreed: true, confirmationEmailSent };
    },

    /**
     * Suppression en masse (console d'administration) : chaque compte passe par deleteAccount, exactement comme une suppression
     * unitaire (orchestrateur, journal, effacement, e-mail selon l'offre, mêmes refus). La saisie « SUPPRIMER n » remplace l'email
     * retapé. Un échec n'arrête jamais le lot. Une ligne de journal par compte (account_deletions, par deleteAccount) + une pour le lot.
     */
    async bulkDeleteAccounts({ userIds, confirmText, admin }) {
      if (!Array.isArray(userIds) || userIds.length === 0
        || userIds.some((id) => typeof id !== 'string' || id.trim() === '')) {
        throw new AccountClosureError(400, 'INVALID_USER_IDS', '`userIds` must be a non-empty array of ids');
      }
      const ids = userIds.map((id) => id.trim());
      if (new Set(ids).size !== ids.length) throw new AccountClosureError(400, 'INVALID_USER_IDS', '`userIds` contains duplicates');
      if (ids.length > BULK_DELETE_MAX) {
        throw new AccountClosureError(400, 'TOO_MANY_USERS', `At most ${BULK_DELETE_MAX} accounts per batch`);
      }
      if (normalizeConfirm(confirmText) !== bulkConfirmText(ids.length)) {
        throw new AccountClosureError(400, 'CONFIRMATION_MISMATCH', `Type "${bulkConfirmText(ids.length)}" to confirm`);
      }

      const adminId = admin?.userId ? String(admin.userId) : null;
      const batchId = new mongoose.Types.ObjectId().toString();
      const startedAt = d.now();

      const deleteOne = async (userId) => {
        let email = null;
        try {
          const user = await d.findUser(userId);
          if (!user) return { userId, email, status: 'refused', code: 'ACCOUNT_NOT_FOUND' };
          email = user.email || null;
          // Même chemin que la suppression unitaire : l'email du compte tient lieu de saisie (le lot est confirmé par « SUPPRIMER n »).
          const out = await service.deleteAccount({ userId, actor: { type: 'admin', userId: adminId, batchId }, confirmEmail: user.email });
          return { userId, email, status: 'deleted', confirmationEmailSent: out.confirmationEmailSent === true };
        } catch (err) {
          const code = err?.code === 'USER_NOT_FOUND' ? 'ACCOUNT_NOT_FOUND' : (err instanceof AccountClosureError ? err.code : 'ACCOUNT_CLOSURE_FAILED');
          if (!(err instanceof AccountClosureError)) d.log(`[account-closure] suppression en masse : échec pour le compte ${userId} : ${err?.message || err}`);
          return { userId, email, status: BULK_REFUSED_CODES.has(code) ? 'refused' : 'failed', code };
        }
      };

      const results = new Array(ids.length);
      let next = 0;
      const worker = async () => {
        while (next < ids.length) {
          const i = next;
          next += 1;
          results[i] = await deleteOne(ids[i]);
        }
      };
      await Promise.all(Array.from({ length: Math.min(BULK_DELETE_CONCURRENCY, ids.length) }, worker));

      const totals = {
        requested: ids.length,
        deleted: results.filter((r) => r.status === 'deleted').length,
        refused: results.filter((r) => r.status === 'refused').length,
        failed: results.filter((r) => r.status === 'failed').length,
      };
      // Ligne du lot, sans donnée personnelle : qui, quand, combien.
      try {
        await d.recordAudit({ action: 'accounts_bulk_deleted', batchId, adminId, at: startedAt, finishedAt: d.now(), ...totals });
      } catch (err) {
        d.log(`[account-closure] journal du lot ${batchId} non écrit : ${err?.message || err}`);
      }
      return { batchId, results, totals };
    },
  };
  return service;
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
