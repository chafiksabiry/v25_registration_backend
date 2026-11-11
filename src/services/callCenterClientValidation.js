/** Validation et normalisation d'un client de centre d'appels (pure, testable sans base). */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v, max) => String(v ?? '').trim().slice(0, max);

export function normalizeClientInput(body, { partial = false } = {}) {
  const errors = [];
  const out = {};
  const has = (k) => body && Object.prototype.hasOwnProperty.call(body, k);

  if (!partial || has('name')) {
    const name = str(body?.name, 120);
    if (name.length < 2) errors.push('Le nom du client est requis (2 caractères minimum).');
    else out.name = name;
  }
  if (has('kind')) {
    if (!['external', 'internal'].includes(body.kind)) errors.push('Type de client invalide (external ou internal).');
    else out.kind = body.kind;
  }
  if (has('contactName')) out.contactName = str(body.contactName, 120);
  if (has('contactEmail')) {
    const email = str(body.contactEmail, 160).toLowerCase();
    if (email && !EMAIL.test(email)) errors.push('Adresse e-mail du contact invalide.');
    else out.contactEmail = email;
  }
  if (has('contactPhone')) out.contactPhone = str(body.contactPhone, 40);
  if (has('vatNumber')) out.vatNumber = str(body.vatNumber, 40);
  if (has('notes')) out.notes = str(body.notes, 2000);
  if (has('billingAddress')) {
    const a = body.billingAddress || {};
    out.billingAddress = { street: str(a.street, 160), postalCode: str(a.postalCode, 20), city: str(a.city, 80), country: str(a.country, 80) };
  }
  return { errors, value: out };
}

/** Représentation renvoyée à l'application. */
export function clientView(doc) {
  const d = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(d._id),
    name: d.name,
    kind: d.kind || 'external',
    contactName: d.contactName || '',
    contactEmail: d.contactEmail || '',
    contactPhone: d.contactPhone || '',
    billingAddress: d.billingAddress || { street: '', postalCode: '', city: '', country: '' },
    vatNumber: d.vatNumber || '',
    notes: d.notes || '',
    status: d.status || 'active',
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
  };
}
