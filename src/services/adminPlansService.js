import mongoose from 'mongoose';

function validationError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseBoolean(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value == null) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0' || normalized === '') return false;
  }
  return Boolean(value);
}

function parseFeatures(raw) {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return [];
}

function serializeCompanyPlan(doc) {
  return {
    id: String(doc._id),
    name: doc.name || '',
    price: typeof doc.price === 'number' ? doc.price : 0,
    currency: (doc.currency || 'eur').toLowerCase(),
    stripePriceId: doc.stripePriceId || '',
    description: doc.description || '',
    features: Array.isArray(doc.features) ? doc.features : [],
    isPopular: parseBoolean(doc.isPopular),
    maxGigs: typeof doc.maxGigs === 'number' ? doc.maxGigs : 0,
    maxReps: typeof doc.maxReps === 'number' ? doc.maxReps : 0,
    updatedAt: doc.updatedAt || doc.createdAt || null,
  };
}

function serializeRepPlan(doc) {
  return {
    id: String(doc._id),
    name: doc.name || '',
    price: typeof doc.price === 'number' ? doc.price : 0,
    currency: (doc.currency || 'eur').toLowerCase(),
    stripePriceId: doc.stripePriceId || '',
    description: doc.description || '',
    features: Array.isArray(doc.features) ? doc.features : [],
    isActive: doc.isActive === undefined || doc.isActive === null ? true : parseBoolean(doc.isActive),
    isPopular: parseBoolean(doc.isPopular),
    sortOrder: typeof doc.sortOrder === 'number' ? doc.sortOrder : 0,
    updatedAt: doc.updatedAt || doc.createdAt || null,
  };
}

function serializePublicCompanyPlan(doc) {
  return {
    id: String(doc._id),
    name: doc.name || '',
    description: doc.description || '',
    price: typeof doc.price === 'number' ? doc.price : 0,
    currency: (doc.currency || 'eur').toLowerCase(),
    features: Array.isArray(doc.features) ? doc.features : [],
    popular: parseBoolean(doc.isPopular),
  };
}

function serializePublicRepPlan(doc) {
  const price = typeof doc.price === 'number' ? doc.price : 0;
  return {
    id: String(doc._id),
    name: doc.name || '',
    description: doc.description || '',
    price,
    currency: (doc.currency || 'eur').toLowerCase(),
    features: Array.isArray(doc.features) ? doc.features : [],
    popular: parseBoolean(doc.isPopular),
    ctaLabel: price === 0 ? 'Subscribe' : 'Start trial',
  };
}

function assertObjectId(id, label = 'plan') {
  if (!mongoose.isValidObjectId(id)) {
    throw validationError(`Identifiant ${label} invalide.`);
  }
  return new mongoose.Types.ObjectId(String(id));
}

export async function listCompanyPlans() {
  const db = mongoose.connection.db;
  const docs = await db
    .collection('subscriptionplans')
    .find({})
    .sort({ price: 1 })
    .toArray();
  return { plans: docs.map(serializeCompanyPlan) };
}

export async function updateCompanyPlan(planId, payload = {}) {
  const db = mongoose.connection.db;
  const objectId = assertObjectId(planId, 'company plan');

  const existing = await db.collection('subscriptionplans').findOne({ _id: objectId });
  if (!existing) throw validationError('Plan company introuvable.', 404);

  const update = { updatedAt: new Date() };

  if (payload.name != null) {
    const name = String(payload.name).trim().toUpperCase();
    if (!name) throw validationError('Nom du plan requis.');
    update.name = name;
  }
  if (payload.price != null) {
    const price = Number(payload.price);
    if (!Number.isFinite(price) || price < 0) throw validationError('Prix invalide.');
    update.price = price;
  }
  if (payload.currency != null) {
    update.currency = String(payload.currency).trim().toLowerCase() || 'eur';
  }
  if (payload.stripePriceId != null) {
    update.stripePriceId = String(payload.stripePriceId).trim();
  }
  if (payload.description != null) {
    update.description = String(payload.description).trim();
  }
  if (payload.features != null) {
    update.features = parseFeatures(payload.features);
  }
  if (payload.isPopular != null) {
    update.isPopular = parseBoolean(payload.isPopular);
  }
  if (payload.maxGigs != null) {
    const maxGigs = Number(payload.maxGigs);
    if (!Number.isFinite(maxGigs) || maxGigs < 0) throw validationError('maxGigs invalide.');
    update.maxGigs = Math.round(maxGigs);
  }
  if (payload.maxReps != null) {
    const maxReps = Number(payload.maxReps);
    if (!Number.isFinite(maxReps) || maxReps < 0) throw validationError('maxReps invalide.');
    update.maxReps = Math.round(maxReps);
  }

  if (update.isPopular === true) {
    await db.collection('subscriptionplans').updateMany(
      { _id: { $ne: objectId } },
      { $set: { isPopular: false, updatedAt: new Date() } },
    );
  }

  await db.collection('subscriptionplans').updateOne({ _id: objectId }, { $set: update });
  const doc = await db.collection('subscriptionplans').findOne({ _id: objectId });
  return serializeCompanyPlan(doc);
}

export async function listPublicCompanyPlans() {
  const db = mongoose.connection.db;
  const docs = await db
    .collection('subscriptionplans')
    .find({})
    .sort({ price: 1 })
    .toArray();
  return { plans: docs.map(serializePublicCompanyPlan) };
}

export async function listRepPlans() {
  const db = mongoose.connection.db;
  const docs = await db
    .collection('plans')
    .find({ targetUserType: 'representative' })
    .sort({ sortOrder: 1, price: 1 })
    .toArray();
  return { plans: docs.map(serializeRepPlan) };
}

export async function updateRepPlan(planId, payload = {}) {
  const db = mongoose.connection.db;
  const objectId = assertObjectId(planId, 'rep plan');

  const existing = await db.collection('plans').findOne({
    _id: objectId,
    targetUserType: 'representative',
  });
  if (!existing) throw validationError('Plan REP introuvable.', 404);

  const update = { updatedAt: new Date() };

  if (payload.name != null) {
    const name = String(payload.name).trim();
    if (!name) throw validationError('Nom du plan requis.');
    update.name = name;
  }
  if (payload.price != null) {
    const price = Number(payload.price);
    if (!Number.isFinite(price) || price < 0) throw validationError('Prix invalide.');
    update.price = price;
  }
  if (payload.currency != null) {
    update.currency = String(payload.currency).trim().toLowerCase() || 'eur';
  }
  if (payload.stripePriceId != null) {
    update.stripePriceId = String(payload.stripePriceId).trim();
  }
  if (payload.description != null) {
    update.description = String(payload.description).trim();
  }
  if (payload.features != null) {
    update.features = parseFeatures(payload.features);
  }
  if (payload.isActive != null) {
    update.isActive = Boolean(payload.isActive);
  }
  if (payload.sortOrder != null) {
    const sortOrder = Number(payload.sortOrder);
    if (!Number.isFinite(sortOrder)) throw validationError('Ordre invalide.');
    update.sortOrder = Math.round(sortOrder);
  }

  await db.collection('plans').updateOne({ _id: objectId }, { $set: update });
  const doc = await db.collection('plans').findOne({ _id: objectId });
  return serializeRepPlan(doc);
}

export async function listPublicRepPlans() {
  const db = mongoose.connection.db;
  const docs = await db
    .collection('plans')
    .find({
      targetUserType: 'representative',
      $or: [{ isActive: true }, { isActive: { $exists: false } }, { isActive: null }],
    })
    .sort({ sortOrder: 1, price: 1 })
    .toArray();
  return { plans: docs.map(serializePublicRepPlan) };
}
