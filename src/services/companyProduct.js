import mongoose from 'mongoose';

/**
 * Produit (palier) Call Centre d'un centre, lu côté inscription pour faire respecter la limite de sièges.
 *
 * L'abonnement est écrit par le service orchestrateur dans la collection `subscriptions` (planId -> `subscriptionplans`) ;
 * les deux services lisent la même base MongoDB (même variable MONGODB_URI). Le palier vient des métadonnées Stripe du plan :
 * `harx_product=callcenter` et `callcenter_tier`.
 * Même règle que le front (v25_callcenter_front, src/domain/plans.ts, normalizePlanId).
 */
export const PRODUCT_IDS = ['nomad_solo', 'accueil', 'full_scope', 'multi_clients'];

/** Anciennes valeurs de `callcenter_tier` encore lues. */
const LEGACY_TIER_ALIASES = {
  essentiel: 'nomad_solo',
  equipe: 'full_scope',
  multi_pays: 'multi_clients',
  multi_clients: 'multi_clients',
};

/** Abonnements qui ouvrent des droits : actif ou en essai. */
export const ENTITLED_STATUSES = ['active', 'trialing'];

export const NOMAD_SOLO_SEAT_MESSAGE =
  'Nomad Solo est prévu pour un seul utilisateur : passez à Accueil / Secrétariat pour inviter votre équipe.';

/** @returns {string|null} identifiant de produit canonique, ou null si la valeur est inconnue. */
export function normalizePlanId(value) {
  const key = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (PRODUCT_IDS.includes(key)) return key;
  return LEGACY_TIER_ALIASES[key] || null;
}

function metadataEntries(metadata) {
  if (!metadata) return {};
  const source = metadata instanceof Map ? Object.fromEntries(metadata.entries()) : metadata;
  if (typeof source !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(source)) out[String(k).trim().toLowerCase()] = v;
  return out;
}

/** Produit d'un plan d'abonnement d'après ses métadonnées Stripe ; null si ce n'est pas un plan Call Centre ou si le palier est inconnu. */
export function productFromPlanMetadata(metadata) {
  const meta = metadataEntries(metadata);
  if (String(meta.harx_product ?? '').trim().toLowerCase() !== 'callcenter') return null;
  return normalizePlanId(meta.callcenter_tier);
}

/** Produit d'après un abonnement (statut) et son plan ; null si l'abonnement n'est ni actif ni en essai, ou si le palier est inconnu. */
export function resolveCompanyProduct(subscription, plan) {
  if (!subscription || !ENTITLED_STATUSES.includes(String(subscription.status ?? '').trim().toLowerCase())) return null;
  return productFromPlanMetadata(plan?.metadata);
}

/**
 * Décision de blocage de la création d'un siège (invitation de membre ou d'agent).
 * Le siège du titulaire compte pour 1 ; seul Nomad Solo (abonnement actif ou en essai) refuse tout siège en plus.
 * Sans abonnement ou palier inconnu : pas de blocage (comme le front). Les 3 autres produits ne bloquent pas.
 * @returns {{ allowed: boolean, message?: string }}
 */
export function seatDecision(product) {
  if (product === 'nomad_solo') return { allowed: false, message: NOMAD_SOLO_SEAT_MESSAGE };
  return { allowed: true };
}

async function lastEntitledSubscription(db, companyId) {
  const ids = [String(companyId)];
  if (mongoose.isValidObjectId(String(companyId))) ids.push(new mongoose.Types.ObjectId(String(companyId)));
  return db
    .collection('subscriptions')
    .find({ companyId: { $in: ids }, status: { $in: ENTITLED_STATUSES } })
    .sort({ createdAt: -1 })
    .limit(1)
    .next();
}

/** @returns {Promise<string|null>} produit du centre (abonnement actif ou en essai), sinon null. */
export async function getCompanyProduct(companyId, db = mongoose.connection.db) {
  if (!companyId) return null;
  const subscription = await lastEntitledSubscription(db, companyId);
  if (!subscription?.planId) return null;
  const planId = mongoose.isValidObjectId(String(subscription.planId))
    ? new mongoose.Types.ObjectId(String(subscription.planId))
    : subscription.planId;
  const plan = await db.collection('subscriptionplans').findOne({ _id: planId });
  return resolveCompanyProduct(subscription, plan);
}

/**
 * À appeler avant toute création de siège. Lève une erreur HTTP 403 pour Nomad Solo.
 * Si la lecture de l'abonnement échoue, on ne bloque pas (comme sans abonnement) et on journalise.
 */
export async function assertCanAddSeat(companyId, db) {
  let product = null;
  try {
    product = await getCompanyProduct(companyId, db);
  } catch (error) {
    console.error('Lecture du produit du centre impossible, siège non bloqué :', error?.message || error);
    return;
  }
  const decision = seatDecision(product);
  if (!decision.allowed) {
    const err = new Error(decision.message);
    err.statusCode = 403;
    err.code = 'SEAT_LIMIT_NOMAD_SOLO';
    throw err;
  }
}
