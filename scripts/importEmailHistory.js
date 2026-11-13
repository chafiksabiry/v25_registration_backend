#!/usr/bin/env node
/**
 * Envoie au backend des emails CONFIRMES par Zoho CRM (NDJSON : une entree JSON par ligne avec
 * zohoEmailId, subject, recipient, sentAt, dealId?, method?, status?).
 *
 *   node scripts/importEmailHistory.js fichier.ndjson            # simulation : valide, n'ecrit rien
 *   API_BASE=https://... ADMIN_TOKEN=... node scripts/importEmailHistory.js fichier.ndjson --apply
 *
 * Les lignes sans zohoEmailId ou sans sentAt sont refusees : aucun email non confirme n'est enregistre.
 */
import fs from 'node:fs';
import readline from 'node:readline';
import { MAX_BULK_ENTRIES, normalizeEmailEntry } from '../src/utils/emailHistoryValidation.js';

const file = process.argv[2];
const apply = process.argv.includes('--apply');
if (!file) {
  console.error('Usage: node scripts/importEmailHistory.js <fichier.ndjson> [--apply]');
  process.exit(1);
}
const { API_BASE, ADMIN_TOKEN } = process.env;
if (apply && (!API_BASE || !ADMIN_TOKEN)) {
  console.error('API_BASE et ADMIN_TOKEN sont requis avec --apply');
  process.exit(1);
}

const entries = [];
let invalid = 0;
const lines = readline.createInterface({ input: fs.createReadStream(file) });
for await (const line of lines) {
  if (!line.trim()) continue;
  try {
    const result = normalizeEmailEntry(JSON.parse(line));
    if (result.ok) entries.push(JSON.parse(line));
    else invalid += 1;
  } catch {
    invalid += 1;
  }
}
console.log(`${entries.length} entrees confirmees valides, ${invalid} refusees (non confirmees ou invalides)`);
if (!apply) {
  console.log('Simulation : rien envoye. Relancer avec --apply pour enregistrer.');
  process.exit(0);
}

const total = { received: 0, recorded: 0, usersFound: 0, skippedDuplicates: 0, noUser: 0, conflicts: 0, rejected: 0, errors: 0 };
for (let i = 0; i < entries.length; i += MAX_BULK_ENTRIES) {
  const response = await fetch(`${API_BASE}/api/admin/email-history/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({ entries: entries.slice(i, i + MAX_BULK_ENTRIES) }),
  });
  if (!response.ok) {
    console.error(`Lot ${i / MAX_BULK_ENTRIES + 1} : HTTP ${response.status}`);
    process.exit(1);
  }
  const report = await response.json();
  for (const key of Object.keys(total)) {
    total[key] += Array.isArray(report[key]) ? report[key].length : report[key] || 0;
  }
}
console.log(JSON.stringify(total, null, 2));
