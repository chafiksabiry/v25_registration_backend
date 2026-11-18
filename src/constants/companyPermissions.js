import { activeEmployments } from '../utils/employments.js';
/** Action-level rights for company members. Owner bypasses this list. */

export const PERMISSION_GROUPS = [
  {
    id: 'gigs',
    actions: ['view', 'create', 'edit', 'delete', 'activate'],
  },
  {
    id: 'leads',
    actions: ['view', 'import', 'create', 'edit', 'archive', 'export'],
  },
  {
    id: 'telephony',
    actions: ['view', 'search', 'buy', 'assign', 'terminate', 'test'],
  },
  {
    id: 'scripts',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    id: 'knowledge',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    id: 'matching',
    actions: ['view', 'invite', 'decide'],
  },
  {
    id: 'training',
    actions: ['view', 'edit'],
  },
  {
    id: 'calls',
    actions: ['view', 'listen', 'validate'],
  },
  {
    id: 'billing',
    actions: ['view', 'buy'],
  },
  {
    id: 'members',
    actions: ['view', 'invite', 'edit', 'remove'],
  },
  {
    id: 'settings',
    actions: ['view', 'edit'],
  },
];

export function allPermissionKeys() {
  const keys = [];
  for (const group of PERMISSION_GROUPS) {
    for (const action of group.actions) {
      keys.push(`${group.id}.${action}`);
    }
  }
  return keys;
}

export function emptyPermissions() {
  const out = {};
  for (const key of allPermissionKeys()) out[key] = false;
  return out;
}

export function allPermissions() {
  const out = {};
  for (const key of allPermissionKeys()) out[key] = true;
  return out;
}

const OPERATOR_KEYS = [
  'gigs.view', 'gigs.create', 'gigs.edit', 'gigs.activate',
  'leads.view', 'leads.import', 'leads.create', 'leads.edit',
  'telephony.view', 'telephony.search', 'telephony.assign', 'telephony.test',
  'scripts.view', 'scripts.create', 'scripts.edit',
  'knowledge.view', 'knowledge.create', 'knowledge.edit',
  'matching.view',
  'training.view',
  'calls.view', 'calls.listen', 'calls.validate',
  'billing.view',
  'settings.view',
];

function withKeys(keys) {
  const out = emptyPermissions();
  for (const key of keys) {
    if (key in out) out[key] = true;
  }
  return out;
}

/**
 * Droit d'écouter les enregistrements d'appels. Sur l'offre Accueil / Secrétariat, personne ne l'a par défaut : seul un
 * accord explicite du titulaire le donne (décision du 18/11/2026). Les autres offres gardent leurs droits par défaut.
 */
export const LISTEN_KEY = 'calls.listen';

/** Produit retenu quand le palier du centre n'a pas pu être lu : l'écoute reste alors sur accord explicite (prudence). */
export const UNKNOWN_PRODUCT = 'unknown';

/** Offres où l'écoute des enregistrements est sur accord explicite du titulaire. */
export function listenIsOptIn(product) {
  return product === 'accueil' || product === UNKNOWN_PRODUCT;
}

/**
 * Droits d'un profil historique. `product` (palier du centre) : sur Accueil, « operator » n'écoute pas les
 * enregistrements ; « admin » reste un accord explicite de tous les droits, « readonly » n'écoute déjà pas.
 */
export function presetPermissions(preset, { product = null } = {}) {
  const id = String(preset || '').toLowerCase();
  if (id === 'admin') return allPermissions();
  if (id === 'readonly') {
    return withKeys(allPermissionKeys().filter((key) => key.endsWith('.view')));
  }
  if (id === 'operator') {
    return withKeys(listenIsOptIn(product) ? OPERATOR_KEYS.filter((key) => key !== LISTEN_KEY) : OPERATOR_KEYS);
  }
  return null;
}

/** Vrai si un corps de requête demande explicitement l'écoute (case « Écouter » cochée par le titulaire). */
export function explicitListenRequested(permissions) {
  return Boolean(permissions && typeof permissions === 'object' && (permissions[LISTEN_KEY] === true || permissions[LISTEN_KEY] === 'true'));
}

/**
 * Droits réels d'un membre de l'équipe (rattachement ou invitation). Sur une offre à écoute explicite, `calls.listen`
 * n'est retenu que si le titulaire l'a accordé (`listenGrantedAt`) ou si le profil est « admin » (tous les droits) ;
 * un ancien rattachement sans cet accord perd l'écoute (nouveau défaut, sans script de migration).
 */
export function effectiveMemberPermissions(doc, product) {
  const out = sanitizePermissions(doc?.permissions);
  if (out[LISTEN_KEY] && listenIsOptIn(product) && doc?.preset !== 'admin' && !doc?.listenGrantedAt) {
    out[LISTEN_KEY] = false;
  }
  return out;
}

/**
 * Date d'accord de l'écoute à enregistrer après une invitation ou un changement de droits : conservée ou posée si
 * l'écoute est accordée explicitement (case cochée, ou profil admin), effacée si l'écoute est retirée, inchangée sinon.
 */
export function nextListenGrantedAt({ rights, preset, requested, previous = null, now = new Date() }) {
  if (!rights?.[LISTEN_KEY]) return null;
  if (explicitListenRequested(requested) || String(preset || '').toLowerCase() === 'admin') return previous || now;
  return previous || null;
}

export function sanitizePermissions(input) {
  const out = emptyPermissions();
  if (!input || typeof input !== 'object') return out;
  for (const key of Object.keys(out)) {
    if (input[key] === true || input[key] === 'true') out[key] = true;
  }
  return out;
}

/** Agent employé par un centre d'appels (compte rep rattaché à une société) : prendre ses appels, se former, voir son planning. */
const AGENT_KEYS = ['gigs.view', 'calls.view', 'calls.listen', 'training.view'];

/**
 * Droits d'un agent (secrétaire) dans un centre. Sans option : droits historiques (écoute comprise). `product` : sur
 * Accueil, pas d'écoute par défaut. `listen` : décision enregistrée du titulaire pour cette personne (true accorde,
 * false retire, null/undefined = défaut de l'offre).
 */
export function agentPermissions({ product = null, listen = null } = {}) {
  const out = withKeys(AGENT_KEYS);
  if (listenIsOptIn(product)) out[LISTEN_KEY] = false;
  if (listen === true) out[LISTEN_KEY] = true;
  if (listen === false) out[LISTEN_KEY] = false;
  return out;
}

export function isCallCenterAgent(user) {
  return user?.typeUser === 'rep' && activeEmployments(user).length > 0;
}

/**
 * Contact d'un client du centre (portail client, lecture seule) : il consulte les appels de SES opérations, et les
 * écoute seulement si le centre l'autorise. Aucun droit de gestion, quel que soit l'écran.
 */
export function clientPermissions({ allowRecordings = false } = {}) {
  return withKeys(allowRecordings ? ['calls.view', 'calls.listen'] : ['calls.view']);
}

export const CLIENT_PORTAL_USER_TYPE = 'client-portal';

export function isClientPortalUser(user) {
  return user?.typeUser === CLIENT_PORTAL_USER_TYPE;
}
