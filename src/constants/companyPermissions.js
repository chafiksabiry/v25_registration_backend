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
    id: 'chat',
    actions: ['view', 'reply'],
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

export function presetPermissions(preset) {
  const id = String(preset || '').toLowerCase();
  if (id === 'admin') return allPermissions();
  if (id === 'readonly') {
    return withKeys(allPermissionKeys().filter((key) => key.endsWith('.view')));
  }
  if (id === 'operator') return withKeys(OPERATOR_KEYS);
  return null;
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
  chat: 'Chat',
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
  chat: 'Chat',
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
