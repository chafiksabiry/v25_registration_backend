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
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    id: 'calls',
    actions: ['view', 'listen', 'validate', 'export'],
  },
  {
    id: 'dashboard',
    actions: ['view'],
  },
  {
    id: 'agents',
    actions: ['view', 'create', 'edit', 'remove'],
  },
  {
    id: 'planning',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    id: 'emails',
    actions: ['view', 'create', 'send'],
  },
  {
    id: 'voice',
    actions: ['view', 'edit'],
  },
  {
    id: 'activation',
    actions: ['view', 'edit'],
  },
  {
    id: 'quality',
    actions: ['view', 'review'],
  },
  {
    id: 'operations',
    actions: ['view'],
  },
  {
    id: 'analytics',
    actions: ['view'],
  },
  {
    id: 'wallet',
    actions: ['view', 'deposit', 'withdraw'],
  },
  {
    id: 'subscription',
    actions: ['view', 'change'],
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

/** Écoute d'un membre sur une offre à écoute explicite : admin sauf retrait par le titulaire ; sinon accord du titulaire. */
function optInListen(preset, grantedAt, revokedAt) {
  const granted = grantedAt ? new Date(grantedAt).getTime() : 0;
  const revoked = revokedAt ? new Date(revokedAt).getTime() : 0;
  // Admin : écoute sauf retrait postérieur au dernier accord. Autres : accord sans retrait postérieur.
  if (String(preset || '').toLowerCase() === 'admin') return !revoked || granted > revoked;
  return Boolean(granted) && granted > revoked;
}

/**
 * Droits réels d'un membre de l'équipe (rattachement ou invitation). Sur une offre à écoute explicite, `calls.listen`
 * vient seulement de la décision du titulaire : accord (`listenGrantedAt`), ou profil « admin » tant que le titulaire ne
 * l'a pas retirée (`listenRevokedAt`). Un ancien rattachement sans accord perd l'écoute (nouveau défaut, sans script).
 */
export function effectiveMemberPermissions(doc, product) {
  const out = sanitizePermissions(doc?.permissions);
  if (listenIsOptIn(product)) {
    out[LISTEN_KEY] = optInListen(doc?.preset, doc?.listenGrantedAt, doc?.listenRevokedAt);
  }
  return out;
}

/**
 * Écoute d'un membre après une invitation ou un changement de droits.
 * - Seule une intention explicite (`listenGrant: true|false`, champ dédié du corps) du titulaire PROUVÉ (JWT = companies.userId)
 *   pose ou retire l'accord. Un `calls.listen` reçu dans le jeu complet de permissions d'un écran générique ne vaut jamais
 *   accord, et un membre (même avec members.edit / members.invite, même admin) n'accorde rien, ni à lui-même ni aux autres.
 * - Offre à écoute explicite connue (Accueil) : `calls.listen` enregistré = décision du titulaire (admin : oui sauf retrait).
 * - Palier illisible ('unknown') : rien n'est figé, les droits du profil sont enregistrés tels quels ; la règle s'applique à la lecture.
 * - Autres offres : droits génériques inchangés.
 * - Profil « admin » attribué par un non-titulaire : l'écoute ne suit pas (listenRevokedAt posé sauf accord existant).
 * @returns {{ rights: object, listenGrantedAt: Date|null, listenRevokedAt: Date|null }}
 */
export function resolveMemberListen({ product, rights, preset, previousPreset = null, ownerProven = false, listenGrant, previousGrantedAt = null, previousRevokedAt = null, now = new Date() }) {
  let listenGrantedAt = previousGrantedAt || null;
  let listenRevokedAt = previousRevokedAt || null;
  // Profil « admin » attribué par un non-titulaire (invitation ou changement de profil) : l'écoute ne suit pas.
  // Le membre garde l'écoute qu'il avait (accord existant), sinon elle est marquée retirée jusqu'à décision du titulaire.
  const becomesAdmin = String(preset || '').toLowerCase() === 'admin' && String(previousPreset || '').toLowerCase() !== 'admin';
  if (listenIsOptIn(product) && becomesAdmin && !ownerProven && !listenGrantedAt) listenRevokedAt = listenRevokedAt || now;
  if (ownerProven && typeof listenGrant === 'boolean') {
    listenGrantedAt = listenGrant ? previousGrantedAt || now : null;
    listenRevokedAt = listenGrant ? null : previousRevokedAt || now;
  }
  const out = { ...rights };
  if (listenIsOptIn(product) && product !== UNKNOWN_PRODUCT) out[LISTEN_KEY] = optInListen(preset, listenGrantedAt, listenRevokedAt);
  return { rights: out, listenGrantedAt, listenRevokedAt };
}

/** Profil pour l'écriture : en cas de palier illisible, aucune soustraction n'est figée en base. */
export function productForWrite(product) {
  return product === UNKNOWN_PRODUCT ? null : product;
}

const GROUP_LABELS = {
  gigs: 'Gigs',
  leads: 'Prospects',
  telephony: 'Téléphonie',
  scripts: 'Scripts',
  knowledge: 'Base de connaissances',
  matching: 'Matching / REPs',
  training: 'Formation',
  calls: 'Appels',
  dashboard: 'Tableau de bord',
  agents: 'Agents',
  planning: 'Planification',
  emails: 'E-mails',
  voice: 'Assistant vocal',
  activation: 'Activation des gigs',
  quality: 'Qualité',
  operations: 'Opérations',
  analytics: 'Analytique',
  wallet: 'Portefeuille',
  subscription: 'Abonnement',
  billing: 'Tokens et facturation',
  members: 'Équipe',
  settings: 'Réglages',
};

const ACTION_LABELS = {
  view: 'Voir',
  create: 'Créer',
  edit: 'Modifier',
  delete: 'Supprimer',
  activate: 'Activer / pause',
  import: 'Importer',
  archive: 'Archiver',
  export: 'Exporter',
  search: 'Rechercher',
  buy: 'Acheter',
  assign: 'Affecter',
  terminate: 'Résilier',
  test: 'Appel test',
  invite: 'Inviter',
  decide: 'Accepter / refuser',
  listen: 'Écouter',
  validate: 'Valider',
  remove: 'Retirer',
  send: 'Envoyer',
  reply: 'Répondre',
  review: 'Contrôler',
  deposit: 'Déposer',
  withdraw: 'Retirer',
  change: 'Changer de plan',
};

const KEY_LABELS = {
  'knowledge.create': 'Ajouter',
  'voice.edit': 'Configurer',
  'members.edit': 'Modifier les droits',
};

const GROUP_LABELS_EN = {
  gigs: 'Gigs',
  leads: 'Prospects',
  telephony: 'Telephony',
  scripts: 'Scripts',
  knowledge: 'Knowledge base',
  matching: 'Matching / REPs',
  training: 'Training',
  calls: 'Calls',
  dashboard: 'Dashboard',
  agents: 'Agents',
  planning: 'Planning',
  emails: 'Emails',
  voice: 'Voice assistant',
  activation: 'Gig activation',
  quality: 'Quality',
  operations: 'Operations',
  analytics: 'Analytics',
  wallet: 'Wallet',
  subscription: 'Subscription',
  billing: 'Tokens and billing',
  members: 'Team',
  settings: 'Settings',
};

const ACTION_LABELS_EN = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  activate: 'Activate / pause',
  import: 'Import',
  archive: 'Archive',
  export: 'Export',
  search: 'Search',
  buy: 'Buy',
  assign: 'Assign',
  terminate: 'Terminate',
  test: 'Test call',
  invite: 'Invite',
  decide: 'Accept / decline',
  listen: 'Listen',
  validate: 'Validate',
  remove: 'Remove',
  send: 'Send',
  reply: 'Reply',
  review: 'Review',
  deposit: 'Deposit',
  withdraw: 'Withdraw',
  change: 'Change plan',
};

const KEY_LABELS_EN = {
  'knowledge.create': 'Add',
  'voice.edit': 'Configure',
  'members.edit': 'Edit rights',
};

export function describeGrantedAccess(permissions, lang = 'fr') {
  const english = lang === 'en';
  const groupLabels = english ? GROUP_LABELS_EN : GROUP_LABELS;
  const actionLabels = english ? ACTION_LABELS_EN : ACTION_LABELS;
  const keyLabels = english ? KEY_LABELS_EN : KEY_LABELS;
  const lines = [];
  for (const group of PERMISSION_GROUPS) {
    const granted = group.actions.filter((action) => permissions?.[`${group.id}.${action}`] === true);
    if (!granted.length) continue;
    const actions = granted.map((action) => keyLabels[`${group.id}.${action}`] || actionLabels[action] || action);
    lines.push(`${groupLabels[group.id] || group.id} : ${actions.join(', ')}`);
  }
  return lines;
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
