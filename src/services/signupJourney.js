import mongoose from 'mongoose';
import User from '../models/User.js';
import { journeyStampUpdate } from '../utils/signupJourney.js';

/**
 * Pose une étape du parcours d'inscription (première fois seulement, voir utils/signupJourney.js). Jamais bloquant : une écriture
 * en échec est journalisée et n'interrompt jamais l'action de la personne (vérification, enregistrement de la mise en route).
 * @returns {Promise<boolean>} true si l'étape vient d'être posée
 */
export async function stampJourney(userId, milestone, opts = {}) {
  try {
    if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) return false;
    const op = journeyStampUpdate(new mongoose.Types.ObjectId(String(userId)), milestone, opts);
    if (!op) return false;
    const r = await User.collection.updateOne(op.filter, op.update);
    return r.modifiedCount === 1;
  } catch (err) {
    console.warn(`[journey] étape ${milestone} non posée :`, err?.message || err);
    return false;
  }
}

/** Même chose pour le titulaire d'une société (`companies.userId`). */
export async function stampJourneyForCompany(companyId, milestone, opts = {}) {
  try {
    if (!companyId || !mongoose.Types.ObjectId.isValid(String(companyId))) return false;
    const company = await mongoose.connection.db
      .collection('companies')
      .findOne({ _id: new mongoose.Types.ObjectId(String(companyId)) }, { projection: { userId: 1 } });
    return company?.userId ? stampJourney(company.userId, milestone, opts) : false;
  } catch (err) {
    console.warn(`[journey] étape ${milestone} (société) non posée :`, err?.message || err);
    return false;
  }
}

/**
 * Étapes lues dans l'enregistrement de la mise en route du portail (PUT de l'état du centre) : « Votre offre » terminée -> offer_chosen,
 * mise en route terminée -> onboarding_finished. Seules la présence de ces marques est lue ; la date est celle du serveur.
 */
export function workspaceMilestones(body) {
  const o = body?.company?.onboarding;
  if (!o || typeof o !== 'object') return [];
  const out = [];
  const offer = o.timings?.offer;
  if (offer && typeof offer === 'object' && typeof offer.completedAt === 'number' && Number.isFinite(offer.completedAt)) out.push('offer_chosen');
  if (o.done === true) out.push('onboarding_finished');
  return out;
}
