import mongoose from 'mongoose';
import { ENTITLED_STATUSES, productFromPlanMetadata } from './companyProduct.js';

/**
 * Offre réelle d'un compte (NOMAD / CLOUD) et, pour CLOUD, son produit (Receptionist / Entreprise / Contact Centre).
 *
 * Le type « historique » du compte (`typeUser: 'call-center'`, `product: 'callcentre'`) est le même pour toute inscription
 * téléphonie : il ne dit pas l'offre. L'offre se lit sur les sociétés du compte :
 *  1. dernier palier connu de l'abonnement (même règle que getLastKnownCompanyProduct : abonnement actif ou en essai le
 *     plus récent, sinon le plus récent à palier connu quel que soit son statut) ;
 *  2. sinon le profil enregistré par le portail (`accountProfile` : « solo » = NOMAD, « company » = CLOUD, produit inconnu) ;
 *  3. sinon inconnue (null).
 *
 * Correspondance palier -> offre / produit (identifiants de plan du code : companyProduct.js PRODUCT_IDS, et
 * v25_callcenter_front src/domain/plans.ts ; noms figés par NON-REGRESSION.md, « Receptionist (ex-Accueil / Secrétariat) »,
 * « Entreprise (ex-Full Scope) », « Contact Centre (ex-Multi-clients) ») :
 *  - nomad_solo    -> NOMAD                    (vérifié : plan « Nomad Solo »)
 *  - accueil       -> CLOUD + Receptionist     (vérifié : plan « Accueil / Secrétariat »)
 *  - full_scope    -> CLOUD + Entreprise       (vérifié : plan « Company Full Scope In & Out »)
 *  - multi_clients -> CLOUD + Contact Centre   (vérifié : plan « Contact Centre Multi-clients »)
 * Anciennes valeurs (essentiel, equipe, multi_pays) : ramenées aux paliers ci-dessus par normalizePlanId (code existant),
 * correspondance métier NON VÉRIFIÉE auprès du fondateur.
 */
export const OFFERS = ['nomad', 'cloud'];
export const CLOUD_PRODUCTS = ['receptionist', 'entreprise', 'contact_centre'];

const TIER_OFFER = {
  nomad_solo: { offer: 'nomad', product: null },
  accueil: { offer: 'cloud', product: 'receptionist' },
  full_scope: { offer: 'cloud', product: 'entreprise' },
  multi_clients: { offer: 'cloud', product: 'contact_centre' },
};

const UNKNOWN = Object.freeze({ offer: null, product: null, source: null, tier: null, accountProfile: null });

/** Offre et produit d'un palier canonique (companyProduct.js) ; null si le palier est inconnu. */
export function offerFromTier(tier) {
  return TIER_OFFER[tier] ? { ...TIER_OFFER[tier] } : null;
}

/** Offre d'après le profil du portail (`accountProfile`) ; le produit CLOUD n'y est pas : null. */
export function offerFromAccountProfile(profile) {
  if (profile === 'solo') return { offer: 'nomad', product: null };
  if (profile === 'company') return { offer: 'cloud', product: null };
  return null;
}

/**
 * Résolution à partir de lectures injectées (une société après l'autre, comme pour l'e-mail de suppression).
 * @returns {Promise<{offer: 'nomad'|'cloud'|null, product: string|null, source: 'subscription'|'accountProfile'|null, tier: string|null, accountProfile: string|null}>}
 */
export async function resolveAccountOfferDetail({ companyIds, lastKnownTier, workspaceStates }) {
  for (const id of companyIds) {
    const tier = await lastKnownTier(id);
    const fromTier = offerFromTier(tier);
    if (fromTier) return { ...fromTier, source: 'subscription', tier, accountProfile: null };
  }
  if (!companyIds.length) return { ...UNKNOWN };
  for (const st of (await workspaceStates(companyIds)) || []) {
    const profile = st?.data?.accountProfile;
    const fromProfile = offerFromAccountProfile(profile);
    if (fromProfile) return { ...fromProfile, source: 'accountProfile', tier: null, accountProfile: profile };
  }
  return { ...UNKNOWN };
}

/**
 * Dernier palier connu d'une société à partir de ses abonnements déjà lus (triés du plus récent au plus ancien) :
 * même règle que getLastKnownCompanyProduct (abonnement actif ou en essai le plus récent, sinon les 20 plus récents).
 */
export function lastKnownTierFromSubscriptions(subscriptions, planById) {
  const tierOf = (sub) => (sub?.planId ? productFromPlanMetadata(planById.get(String(sub.planId))?.metadata) : null);
  const entitled = subscriptions.find((s) => ENTITLED_STATUSES.includes(String(s?.status ?? '').trim().toLowerCase()));
  const fromEntitled = tierOf(entitled);
  if (fromEntitled) return fromEntitled;
  for (const sub of subscriptions.slice(0, 20)) {
    const tier = tierOf(sub);
    if (tier) return tier;
  }
  return null;
}

const bothIdForms = (values) => {
  const out = [];
  for (const v of values) {
    if (v == null) continue;
    out.push(String(v));
    if (mongoose.isValidObjectId(String(v))) out.push(new mongoose.Types.ObjectId(String(v)));
  }
  return out;
};

const createdAtDesc = (a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0);

/**
 * Offre de plusieurs comptes en lectures groupées (liste admin) : 4 requêtes au plus, quel que soit le nombre de comptes
 * (sociétés, abonnements, plans, profils du portail). Seules les sociétés dont le compte est titulaire (`companies.userId`)
 * comptent, comme pour l'e-mail de suppression.
 * @returns {Promise<Map<string, {offer, product, source, tier, accountProfile, companyId}>>} clé = id du compte
 */
export async function loadAccountOffers(db, userIds) {
  const result = new Map();
  const ids = [...new Set((userIds || []).map(String))];
  ids.forEach((id) => result.set(id, { ...UNKNOWN, companyId: null }));
  if (!ids.length) return result;

  const companies = await db
    .collection('companies')
    .find({ userId: { $in: bothIdForms(ids) } })
    .project({ _id: 1, userId: 1 })
    .toArray();
  if (!companies.length) return result;

  const companyKeys = bothIdForms(companies.map((c) => c._id));
  const [subscriptions, states] = await Promise.all([
    db
      .collection('subscriptions')
      .find({ companyId: { $in: companyKeys } })
      .project({ companyId: 1, status: 1, planId: 1, createdAt: 1 })
      .toArray(),
    db
      .collection('callcenter_workspace_state')
      .find({ companyId: { $in: companyKeys }, scope: 'company' })
      .project({ companyId: 1, 'data.accountProfile': 1 })
      .toArray(),
  ]);

  const planIds = [...new Set(subscriptions.map((s) => s.planId).filter(Boolean).map(String))];
  const plans = planIds.length
    ? await db.collection('subscriptionplans').find({ _id: { $in: bothIdForms(planIds) } }).project({ metadata: 1 }).toArray()
    : [];
  const planById = new Map(plans.map((p) => [String(p._id), p]));

  const subsByCompany = new Map();
  for (const sub of subscriptions) {
    const key = String(sub.companyId);
    if (!subsByCompany.has(key)) subsByCompany.set(key, []);
    subsByCompany.get(key).push(sub);
  }
  subsByCompany.forEach((list) => list.sort(createdAtDesc));
  const statesByCompany = new Map();
  for (const st of states) {
    const key = String(st.companyId);
    if (!statesByCompany.has(key)) statesByCompany.set(key, []);
    statesByCompany.get(key).push(st);
  }

  const companiesByUser = new Map();
  for (const c of companies) {
    const key = String(c.userId);
    if (!companiesByUser.has(key)) companiesByUser.set(key, []);
    companiesByUser.get(key).push(String(c._id));
  }

  for (const [userId, companyIds] of companiesByUser) {
    if (!result.has(userId)) continue;
    let companyId = null;
    const resolved = await resolveAccountOfferDetail({
      companyIds,
      lastKnownTier: async (id) => {
        const tier = lastKnownTierFromSubscriptions(subsByCompany.get(id) || [], planById);
        if (tier && !companyId) companyId = id;
        return tier;
      },
      workspaceStates: async (list) => {
        const rows = list.flatMap((id) => (statesByCompany.get(id) || []).map((st) => ({ ...st, companyId: id })));
        companyId = rows.find((st) => offerFromAccountProfile(st?.data?.accountProfile))?.companyId || null;
        return rows;
      },
    });
    result.set(userId, { ...resolved, companyId: resolved.offer ? companyId : null });
  }
  return result;
}

/** Offre d'un seul compte (fiche admin) : mêmes lectures groupées que la liste. */
export async function loadAccountOffer(db, userId) {
  return (await loadAccountOffers(db, [userId])).get(String(userId));
}
