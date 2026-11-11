import mongoose from 'mongoose';

function validationError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function assertObjectId(id, label) {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw validationError(`Invalid ${label} id.`);
  }
  return new mongoose.Types.ObjectId(id);
}

function serializeCountry(doc) {
  return {
    id: String(doc._id),
    name: doc.name?.common || '',
    cca2: doc.cca2 || '',
    retractionDays: typeof doc.retractionDays === 'number' ? doc.retractionDays : null,
  };
}

/**
 * List countries and their configured legal retraction (cooling-off) delay.
 * `retractionDays: null` means unset — the 14-day EU standard
 * (Directive 2011/83/EU art. 9) applies as a fallback wherever this is
 * resolved (cahier de recette PAY-10).
 */
export async function listCountries() {
  const db = mongoose.connection.db;
  const docs = await db
    .collection('countries')
    .find({})
    .sort({ 'name.common': 1 })
    .toArray();
  return docs.map(serializeCountry);
}

export async function updateCountryRetractionDays(countryId, retractionDays) {
  const db = mongoose.connection.db;
  const objectId = assertObjectId(countryId, 'country');

  const existing = await db.collection('countries').findOne({ _id: objectId });
  if (!existing) throw validationError('Country not found.', 404);

  let value = null;
  if (retractionDays !== null && retractionDays !== undefined) {
    const n = Number(retractionDays);
    if (!Number.isFinite(n) || n < 0) throw validationError('retractionDays must be a non-negative number or null.');
    value = Math.round(n);
  }

  await db.collection('countries').updateOne({ _id: objectId }, { $set: { retractionDays: value, updatedAt: new Date() } });
  const doc = await db.collection('countries').findOne({ _id: objectId });
  return serializeCountry(doc);
}
