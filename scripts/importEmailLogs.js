/**
 * Importe un fichier NDJSON dans /api/admin/email-logs/bulk.
 * Simulation par defaut : rien n'est envoye sans --apply.
 *
 *   API_BASE=https://<backend> ADMIN_TOKEN=<jwt admin> \
 *     node scripts/importEmailLogs.js emails_activation_mongodb.ndjson [--apply]
 *
 * Le jeton se passe par variable d'environnement, jamais en argument.
 * Idempotent : relancer ne cree pas de doublon (cle campagne + deal Zoho).
 */
import fs from 'node:fs';
import readline from 'node:readline';

const CHUNK = 100;
const file = process.argv[2];
const apply = process.argv.includes('--apply');
const base = (process.env.API_BASE || '').replace(/\/+$/, '');
const token = process.env.ADMIN_TOKEN || '';

if (!file) {
  console.error('Usage: node scripts/importEmailLogs.js <fichier.ndjson> [--apply]');
  process.exit(1);
}
if (apply && (!base || !token)) {
  console.error('--apply exige API_BASE et ADMIN_TOKEN (variables d\'environnement).');
  process.exit(1);
}

const entries = [];
const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  entries.push(JSON.parse(line));
}

console.log(`${entries.length} entrees lues, ${Math.ceil(entries.length / CHUNK)} requetes de ${CHUNK} max.`);
if (!apply) {
  console.log('Simulation : aucune requete envoyee. Ajoutez --apply pour importer.');
  process.exit(0);
}

let inserted = 0;
let updated = 0;
let rejected = 0;
for (let i = 0; i < entries.length; i += CHUNK) {
  const chunk = entries.slice(i, i + CHUNK);
  const response = await fetch(`${base}/api/admin/email-logs/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ entries: chunk }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 422) {
    console.error(`Echec a l'entree ${i} : HTTP ${response.status}`, body);
    process.exit(1);
  }
  inserted += body.inserted || 0;
  updated += body.updated || 0;
  rejected += (body.rejected || []).length;
  console.log(`Lot ${i / CHUNK + 1} : +${body.inserted || 0} nouveaux, ${body.updated || 0} mis a jour, ${(body.rejected || []).length} rejetes`);
}
console.log(`Termine : ${inserted} inseres, ${updated} mis a jour, ${rejected} rejetes.`);
