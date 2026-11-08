#!/usr/bin/env node
/**
 * Creates one migrated-v1-style rep account so the re-engagement flow can be tested
 * (/auth/reactivate form → e-mailed one-click link → session). Dry-run by default.
 *
 *   railway run --service v25_registration_backend --environment Recette -- \
 *     node scripts/seedReengageRep.js --email someone@example.com --name "First Last" \
 *     --expect-db harx_recette --apply
 *
 * Options:
 *   --email <address>    required
 *   --name <full name>   optional (defaults to the part before @)
 *   --expect-db <name>   required with --apply: refuses to write unless the connected database has this exact name
 *   --apply              write (otherwise only prints what would be done)
 *
 * Never changes an existing account: if the address is already taken, it stops.
 * MONGODB_URI is read from the environment only.
 */
import mongoose from 'mongoose';
import { generateReengagementToken, hashReengagementToken } from '../src/utils/reengagementToken.js';
import { buildReengageLink, reengageLinkBase, IMPORT_SOURCE } from '../src/utils/reengagementRequest.js';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) && args[args.indexOf(n) + 1]) || d;
const APPLY = args.includes('--apply');
const EMAIL = String(opt('--email', '')).trim().toLowerCase();
const EXPECT_DB = opt('--expect-db');
const TOKEN_DAYS = 90;

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(EMAIL)) fail('--email <address> is required.');
if (APPLY && !EXPECT_DB) fail('--expect-db <name> is required with --apply.');
const uri = process.env.MONGODB_URI;
if (!uri) fail('MONGODB_URI is required (environment variable).');

const fullName = opt('--name', EMAIL.split('@')[0]);

await mongoose.connect(uri);
const db = mongoose.connection.db;
console.log(`Connected database: ${db.databaseName}`);
if (APPLY && db.databaseName !== EXPECT_DB) {
  await mongoose.disconnect();
  fail(`Refusing to write: connected to "${db.databaseName}", expected "${EXPECT_DB}".`);
}

const users = db.collection('users');
const existing = await users.findOne({ email: EMAIL });
if (existing) {
  console.log(`An account already exists for ${EMAIL} (typeUser=${existing.typeUser}, source=${existing.source || '-'}). Nothing changed.`);
  await mongoose.disconnect();
  process.exit(0);
}

const now = new Date();
const token = generateReengagementToken();
const doc = {
  email: EMAIL,
  fullName,
  phone: null,
  password: null,
  typeUser: 'rep',
  isVerified: false,
  firstTime: true,
  invitationStatus: 'none',
  source: IMPORT_SOURCE,
  importBatch: 'manual-seed',
  createdAt: now,
  reengagement: {
    tokenHash: hashReengagementToken(token),
    expiresAt: new Date(now.getTime() + TOKEN_DAYS * 24 * 60 * 60 * 1000),
    lastUsedAt: null,
  },
};

if (!APPLY) {
  console.log(`Dry run: would create rep ${EMAIL} ("${fullName}", source=${IMPORT_SOURCE}). Add --apply to write.`);
} else {
  await users.insertOne(doc);
  console.log(`Created rep ${EMAIL}.`);
  console.log(`Personal link (valid ${TOKEN_DAYS} days, do not share): ${buildReengageLink(reengageLinkBase(), token)}`);
  console.log('Or type the address on /auth/reactivate to receive a link by e-mail.');
}
await mongoose.disconnect();
