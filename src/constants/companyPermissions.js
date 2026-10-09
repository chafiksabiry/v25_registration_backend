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

export function presetPermissions(preset) {
  const id = String(preset || '').toLowerCase();
  if (id === 'admin') return allPermissions();
  if (id === 'readonly') {
    return withKeys(allPermissionKeys().filter((key) => key.endsWith('.view')));
  }
  if (id === 'operator') return withKeys(OPERATOR_KEYS);
  return null;
}

export function sanitizePermissions(input) {
  const out = emptyPermissions();
  if (!input || typeof input !== 'object') return out;
  for (const key of Object.keys(out)) {
    if (input[key] === true || input[key] === 'true') out[key] = true;
  }
  return out;
}
