import EmailActivationLog from '../models/EmailActivationLog.js';
import {
  DELIVERY_STATUSES,
  MAX_BULK_ENTRIES,
  normalizeEmailLogEntry,
} from '../utils/emailLogValidation.js';

const CONFIRMED = ['delivered', 'opened', 'clicked'];

/**
 * POST /api/admin/email-logs/bulk
 * Corps : { campaign?: string, entries: [...] } (100 entrees max).
 * Idempotent : cle (campaign, zohoDealId). Rejouer un import ne cree pas de
 * doublon et n'ecrase ni le statut de delivrance ni la date d'envoi.
 */
export const bulkUpsertEmailLogs = async (req, res, next) => {
  try {
    const { entries, campaign } = req.body || {};
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ message: 'entries must be a non-empty array' });
    }
    if (entries.length > MAX_BULK_ENTRIES) {
      return res.status(413).json({ message: `At most ${MAX_BULK_ENTRIES} entries per request` });
    }

    const operations = [];
    const rejected = [];
    entries.forEach((raw, index) => {
      const result = normalizeEmailLogEntry(raw, { campaign });
      if (!result.ok) {
        rejected.push({ index, error: result.error });
        return;
      }
      const { campaign: c, zohoDealId, sentAt, deliveryStatus, deliveryConfirmed, ...fields } = result.value;
      operations.push({
        updateOne: {
          filter: { campaign: c, zohoDealId },
          update: {
            $set: fields,
            $setOnInsert: {
              campaign: c,
              zohoDealId,
              sentAt: sentAt || new Date(),
              deliveryStatus,
              deliveryConfirmed,
            },
          },
          upsert: true,
        },
      });
    });

    let inserted = 0;
    let updated = 0;
    if (operations.length > 0) {
      const outcome = await EmailActivationLog.bulkWrite(operations, { ordered: false });
      inserted = outcome.upsertedCount || 0;
      updated = outcome.modifiedCount || 0;
    }

    return res.status(rejected.length === entries.length ? 422 : 200).json({
      received: entries.length,
      inserted,
      updated,
      rejected,
    });
  } catch (error) {
    return next(error);
  }
};

/** GET /api/admin/email-logs?campaign=&email=&batch=&deliveryStatus=&page=&limit= */
export const listEmailLogs = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));

    const filter = {};
    if (req.query.campaign) filter.campaign = String(req.query.campaign);
    if (req.query.email) filter.email = String(req.query.email).trim().toLowerCase();
    if (req.query.batch !== undefined && req.query.batch !== '') {
      const batch = Number(req.query.batch);
      if (!Number.isInteger(batch)) return res.status(400).json({ message: 'batch must be an integer' });
      filter.batch = batch;
    }
    if (req.query.deliveryStatus) {
      if (!DELIVERY_STATUSES.includes(String(req.query.deliveryStatus))) {
        return res.status(400).json({ message: 'Invalid deliveryStatus' });
      }
      filter.deliveryStatus = String(req.query.deliveryStatus);
    }

    const [items, total] = await Promise.all([
      EmailActivationLog.find(filter).sort({ sentAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      EmailActivationLog.countDocuments(filter),
    ]);

    return res.json({ page, limit, total, items });
  } catch (error) {
    return next(error);
  }
};

/** GET /api/admin/email-logs/stats?campaign= : totaux et delivrance par lot. */
export const emailLogStats = async (req, res, next) => {
  try {
    const match = req.query.campaign ? { campaign: String(req.query.campaign) } : {};
    const [byBatch, byStatus] = await Promise.all([
      EmailActivationLog.aggregate([
        { $match: match },
        {
          $group: {
            _id: { campaign: '$campaign', batch: '$batch' },
            total: { $sum: 1 },
            deliveryConfirmed: { $sum: { $cond: ['$deliveryConfirmed', 1, 0] } },
          },
        },
        { $sort: { '_id.campaign': 1, '_id.batch': 1 } },
      ]),
      EmailActivationLog.aggregate([
        { $match: match },
        { $group: { _id: '$deliveryStatus', count: { $sum: 1 } } },
      ]),
    ]);

    const total = byBatch.reduce((sum, row) => sum + row.total, 0);
    const confirmed = byBatch.reduce((sum, row) => sum + row.deliveryConfirmed, 0);
    return res.json({
      total,
      deliveryConfirmed: confirmed,
      byDeliveryStatus: Object.fromEntries(byStatus.map((row) => [row._id, row.count])),
      byBatch: byBatch.map((row) => ({
        campaign: row._id.campaign,
        batch: row._id.batch,
        total: row.total,
        deliveryConfirmed: row.deliveryConfirmed,
      })),
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * PATCH /api/admin/email-logs/delivery
 * Corps : { campaign?: string, updates: [{ zohoDealId, deliveryStatus }] } (100 max).
 * Sert a renseigner la delivrance une fois confirmee (webhook, rapport Zoho).
 */
export const updateDeliveryStatus = async (req, res, next) => {
  try {
    const { updates, campaign = 'reps_activation' } = req.body || {};
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ message: 'updates must be a non-empty array' });
    }
    if (updates.length > MAX_BULK_ENTRIES) {
      return res.status(413).json({ message: `At most ${MAX_BULK_ENTRIES} updates per request` });
    }

    const operations = [];
    const rejected = [];
    updates.forEach((item, index) => {
      const zohoDealId = String(item?.zohoDealId ?? '').trim();
      const deliveryStatus = String(item?.deliveryStatus ?? '').trim();
      if (!/^\d{6,25}$/.test(zohoDealId) || !DELIVERY_STATUSES.includes(deliveryStatus)) {
        rejected.push({ index, error: 'zohoDealId or deliveryStatus is invalid' });
        return;
      }
      operations.push({
        updateOne: {
          filter: { campaign: String(campaign), zohoDealId },
          update: { $set: { deliveryStatus, deliveryConfirmed: CONFIRMED.includes(deliveryStatus) } },
        },
      });
    });

    let matched = 0;
    if (operations.length > 0) {
      const outcome = await EmailActivationLog.bulkWrite(operations, { ordered: false });
      matched = outcome.matchedCount || 0;
    }
    return res.json({ received: updates.length, matched, rejected });
  } catch (error) {
    return next(error);
  }
};
