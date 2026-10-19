#!/usr/bin/env node
/**
 * Import HARX v1 reps (cleaned JSONL) into the `users` collection.
 *
 * Usage (dry-run is the default, nothing is written):
 *   MONGODB_URI="mongodb://..." node scripts/importV1Reps.js --file reps_clean.jsonl
 *   MONGODB_URI="mongodb://..." node scripts/importV1Reps.js --file reps_clean.jsonl --segments A,C --limit 500 --apply
 *   MONGODB_URI="mongodb://..." node scripts/importV1Reps.js --rollback v1-reps-2026-10 --apply
 *
 * Options:
 *   --file <path>        JSONL produced by the cleaning step (one rep per line)
 *   --segments A,C,D     A = v1 onboarding completed, C = profile filled but not completed, D = e-mail only
 *   --limit <n>          stop after n eligible reps (use for a pilot batch)
 *   --batch-id <id>      label stored on each imported user (default: v1-reps-<yyyy-mm>)
 *   --apply              actually write (omit for a dry-run)
 *   --rollback <id>      delete the users imported under that batch id that have not signed in since
 *
 * Rules:
 *   - MONGODB_URI is required and read from the environment only.
 *   - Existing users (same e-mail) are never modified.
 *   - Imported users have no password and are not verified; the agent profile is created
 *     later by the normal onboarding flow (agentService), so no agents/wallets are written here.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import readline from 'readline';
import mongoose from 'mongoose';

dotenv.config();

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

const APPLY = flag('--apply');
const FILE = opt('--file');
const ROLLBACK = opt('--rollback');
const SEGMENTS = new Set((opt('--segments', 'A,C,D') || '').split(',').map((s) => s.trim().toUpperCase()));
const LIMIT = Number(opt('--limit', 0)) || Infinity;
const BATCH_ID = opt('--batch-id', `v1-reps-${new Date().toISOString().slice(0, 7)}`);
const CHUNK = 500;
const SOURCE = 'harx_v1_import';

function buildUser(rep, now) {
  return {
    email: rep.email,
    fullName: rep.fullName,
    phone: rep.phone || null,
    password: null,
    typeUser: 'rep',
    isVerified: false,
    firstTime: true,
    invitationStatus: 'none',
    source: SOURCE,
    importBatch: BATCH_ID,
    createdAt: now,
    legacyV1: {
      segment: rep.segment,
      onboardingCompleted: rep.v1OnboardingCompleted,
      createdAt: rep.v1CreatedAt,
      firstName: rep.firstName,
      lastName: rep.lastName,
      nameOrderHint: rep.nameOrderHint,
      country: rep.country,
      languages: rep.languages,
      activities: rep.activities,
      sectors: rep.sectors,
      experience: rep.experience,
      gender: rep.gender,
      birthDate: rep.birthDate,
    },
  };
}

async function* readReps(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) yield JSON.parse(line);
  }
}

async function rollback(db) {
  const filter = { source: SOURCE, importBatch: ROLLBACK, firstTime: true, password: null };
  const count = await db.collection('users').countDocuments(filter);
  console.log(`${APPLY ? '' : '[DRY RUN] '}Rollback batch "${ROLLBACK}": ${count} untouched imported users`);
  if (APPLY && count) {
    const res = await db.collection('users').deleteMany(filter);
    console.log(`Deleted ${res.deletedCount}`);
  }
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is required (environment variable).');
    process.exit(1);
  }
  if (!ROLLBACK && !FILE) {
    console.error('--file <reps_clean.jsonl> is required.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  console.log(`Connected to database "${db.databaseName}" (${APPLY ? 'APPLY' : 'DRY RUN'})`);

  if (ROLLBACK) {
    await rollback(db);
    await mongoose.disconnect();
    return;
  }

  const users = db.collection('users');
  const totals = { read: 0, filtered: 0, existing: 0, toInsert: 0, inserted: 0, errors: 0 };
  const bySegment = {};
  let chunk = [];

  const flush = async () => {
    if (!chunk.length) return;
    const emails = chunk.map((r) => r.email);
    const found = new Set(
      (await users.find({ email: { $in: emails } }, { projection: { email: 1 } }).toArray()).map((u) => u.email)
    );
    const fresh = chunk.filter((r) => !found.has(r.email));
    totals.existing += chunk.length - fresh.length;
    totals.toInsert += fresh.length;
    for (const r of fresh) bySegment[r.segment] = (bySegment[r.segment] || 0) + 1;

    if (APPLY && fresh.length) {
      const now = new Date();
      try {
        const res = await users.insertMany(fresh.map((r) => buildUser(r, now)), { ordered: false });
        totals.inserted += res.insertedCount;
      } catch (error) {
        // ordered:false keeps going; count what landed and what failed (e.g. duplicate e-mail race)
        totals.inserted += error.result?.insertedCount ?? error.insertedCount ?? 0;
        totals.errors += error.writeErrors?.length ?? 1;
        console.error('Batch error:', error.message);
      }
    }
    chunk = [];
  };

  let eligible = 0;
  for await (const rep of readReps(FILE)) {
    totals.read += 1;
    if (!SEGMENTS.has(rep.segment)) {
      totals.filtered += 1;
      continue;
    }
    if (eligible >= LIMIT) break;
    eligible += 1;
    chunk.push(rep);
    if (chunk.length >= CHUNK) await flush();
  }
  await flush();

  console.log(JSON.stringify({ batchId: BATCH_ID, segments: [...SEGMENTS], ...totals, newBySegment: bySegment }, null, 2));
  if (!APPLY) console.log('\nDry run only. Re-run with --apply to write.');
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
