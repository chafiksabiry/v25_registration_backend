/** Validation du portail client : marque blanche et invitation d'un contact (pures, testables sans base). */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const str = (v, max) => String(v ?? '').trim().slice(0, max);

/** Adresse https vers une image png, jpg ou svg, sans identifiants ni caractères de rupture. */
export function validLogoUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > 500 || /[\s"'<>`\\]/.test(raw)) return false;
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.')) return false;
  return /\.(png|jpe?g|svg)$/i.test(u.pathname);
}

/** Marque : nom (2 à 60 caractères), logo (facultatif), couleur #RRGGBB (facultative). */
export function normalizeBrandingInput(body) {
  const errors = [];
  const value = {};
  const displayName = str(body?.displayName, 60);
  if (displayName.length < 2) errors.push('Le nom affiché est requis (2 caractères minimum, 60 au maximum).');
  else value.displayName = displayName;
  const logoUrl = str(body?.logoUrl, 600);
  if (logoUrl && !validLogoUrl(logoUrl)) errors.push('Le logo doit être une adresse https vers une image png, jpg ou svg.');
  else value.logoUrl = logoUrl;
  const color = str(body?.primaryColor, 20);
  if (color && !HEX.test(color)) errors.push('La couleur principale doit être au format #RRGGBB (par exemple #E11D48).');
  else value.primaryColor = color ? color.toUpperCase() : '';
  return { errors, value };
}

export function normalizeClientAccessInput(body, { partial = false } = {}) {
  const errors = [];
  const value = {};
  const has = (k) => body && Object.prototype.hasOwnProperty.call(body, k);
  if (!partial) {
    const email = str(body?.email, 160).toLowerCase();
    if (!email || !EMAIL.test(email)) errors.push('Adresse e-mail du contact invalide.');
    else value.email = email;
    value.fullName = str(body?.fullName, 120);
  }
  if (has('allowRecordings')) {
    if (typeof body.allowRecordings !== 'boolean') errors.push('allowRecordings doit être vrai ou faux.');
    else value.allowRecordings = body.allowRecordings;
  } else if (!partial) value.allowRecordings = false;
  return { errors, value };
}

/** Marque telle que renvoyée au portail client ; null si le centre n'en a pas réglé (le portail garde alors le nom du centre). */
export function brandingView(doc, fallbackName = '') {
  const d = doc && typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    displayName: d?.displayName || fallbackName || '',
    logoUrl: d?.logoUrl || '',
    primaryColor: d?.primaryColor || '',
    configured: Boolean(d?.displayName),
  };
}

export function accessView(doc, user) {
  const d = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    userId: String(d.userId),
    clientId: String(d.clientId),
    email: d.email,
    fullName: d.fullName || user?.fullName || '',
    allowRecordings: Boolean(d.allowRecordings),
    status: d.status,
    invitedAt: d.invitedAt ? new Date(d.invitedAt).toISOString() : null,
    connectedAt: d.connectedAt ? new Date(d.connectedAt).toISOString() : null,
  };
}
