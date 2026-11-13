import { normalizeEmailEntry, normalizeStatusUpdate } from '../utils/emailHistoryValidation.js';

/**
 * Enregistre des emails confirmes dans reengagement.emailHistory des reps EXISTANTS.
 *
 * Garanties (voir les tests) :
 *  - aucun compte n'est cree : le store n'expose aucune creation ;
 *  - seul un ajout atomique a emailHistory est fait : jamais d'ecriture sur les autres champs du rep
 *    ni sur les autres proprietes de `reengagement` (tokenHash, expiresAt, lastUsedAt, lastRequestedAt) ;
 *  - un email deja present (meme zohoEmailId) n'est pas reenregistre ;
 *  - rep introuvable ou ambigu : rien n'est ecrit, et c'est compte.
 *
 * `store` : { findByEmail(email), findByDealId(dealId), pushEmail(userId, entry) -> boolean }
 */
export async function recordEmailHistory(entries, store) {
  const report = {
    received: entries.length,
    recorded: 0,
    usersFound: 0,
    skippedDuplicates: 0,
    noUser: 0,
    conflicts: 0,
    rejected: [],
    errors: [],
  };
  const seen = new Set();

  for (let index = 0; index < entries.length; index += 1) {
    const result = normalizeEmailEntry(entries[index]);
    if (!result.ok) {
      report.rejected.push({ index, error: result.error });
      continue;
    }
    const entry = result.value;

    const key = `${entry.recipient}|${entry.zohoEmailId}`;
    if (seen.has(key)) {
      report.skippedDuplicates += 1;
      continue;
    }
    seen.add(key);

    try {
      let user = await store.findByEmail(entry.recipient);
      if (!user && entry.dealId) user = await store.findByDealId(entry.dealId);
      if (!user) {
        report.noUser += 1;
        continue;
      }
      report.usersFound += 1;

      // Le rep porte deja un autre deal Zoho : on ne sait pas a qui appartient l'email, on n'ecrit rien.
      const knownDeal = user.legacyV1?.crmDealId;
      if (entry.dealId && knownDeal && String(knownDeal) !== entry.dealId) {
        report.conflicts += 1;
        continue;
      }

      const pushed = await store.pushEmail(user._id, entry);
      if (pushed) report.recorded += 1;
      else report.skippedDuplicates += 1;
    } catch (error) {
      report.errors.push({ index, error: error.message });
    }
  }
  return report;
}

/**
 * Met a jour le statut d'emails deja enregistres, uniquement vers un statut plus avance
 * (information fournie par Zoho). `store.updateStatus(zohoEmailId, status, allowedPrevious) -> boolean`.
 */
export async function updateEmailStatuses(updates, store) {
  const report = { received: updates.length, updated: 0, notUpdated: 0, rejected: [], errors: [] };
  for (let index = 0; index < updates.length; index += 1) {
    const result = normalizeStatusUpdate(updates[index]);
    if (!result.ok) {
      report.rejected.push({ index, error: result.error });
      continue;
    }
    try {
      const { zohoEmailId, status, allowedPrevious } = result.value;
      const changed = await store.updateStatus(zohoEmailId, status, allowedPrevious);
      if (changed) report.updated += 1;
      else report.notUpdated += 1;
    } catch (error) {
      report.errors.push({ index, error: error.message });
    }
  }
  return report;
}
