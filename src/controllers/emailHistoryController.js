import { MAX_BULK_ENTRIES } from '../utils/emailHistoryValidation.js';
import { recordEmailHistory, updateEmailStatuses } from '../services/emailHistoryService.js';
import { mongoEmailHistoryStore } from '../services/emailHistoryStore.js';

const checkArray = (value, name, res) => {
  if (!Array.isArray(value) || value.length === 0) {
    res.status(400).json({ message: `${name} must be a non-empty array` });
    return false;
  }
  if (value.length > MAX_BULK_ENTRIES) {
    res.status(413).json({ message: `At most ${MAX_BULK_ENTRIES} ${name} per request` });
    return false;
  }
  return true;
};

/** POST /api/admin/email-history/bulk : { entries: [...] } (100 max). Voir emailHistoryService. */
export const recordEmails = async (req, res, next) => {
  try {
    const entries = req.body?.entries;
    if (!checkArray(entries, 'entries', res)) return undefined;
    return res.json(await recordEmailHistory(entries, mongoEmailHistoryStore));
  } catch (error) {
    return next(error);
  }
};

/** PATCH /api/admin/email-history/status : { updates: [{ zohoEmailId, status }] } (100 max). */
export const updateStatuses = async (req, res, next) => {
  try {
    const updates = req.body?.updates;
    if (!checkArray(updates, 'updates', res)) return undefined;
    return res.json(await updateEmailStatuses(updates, mongoEmailHistoryStore));
  } catch (error) {
    return next(error);
  }
};

/** POST /api/admin/email-history/known : { zohoEmailIds: [...] } -> ids deja enregistres (a ignorer). */
export const knownEmails = async (req, res, next) => {
  try {
    const ids = req.body?.zohoEmailIds;
    if (!checkArray(ids, 'zohoEmailIds', res)) return undefined;
    const clean = ids.map((id) => String(id).trim()).filter(Boolean);
    return res.json({ recorded: await mongoEmailHistoryStore.findRecordedIds(clean) });
  } catch (error) {
    return next(error);
  }
};
