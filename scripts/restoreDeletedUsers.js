#!/usr/bin/env node
/**
 * Restore accidentally deleted users from related collections (agents, gigs, subscriptions).
 *
 * Usage:
 *   node scripts/restoreDeletedUsers.js --dry-run
 *   node scripts/restoreDeletedUsers.js --apply
 *
 * Env:
 *   MONGODB_URI
 *   RESTORE_TEMP_PASSWORD (default HarxRestore2026!)
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';

dotenv.config();

const DEFAULT_URI =
  'mongodb://mongo:DiGaBWUZXCkIxlZMuntztBaFJcOlUJIg@maglev.proxy.rlwy.net:40270/harx?authSource=admin';
const TEMP_PASSWORD = process.env.RESTORE_TEMP_PASSWORD || 'HarxRestore2026!';
const APPLY = process.argv.includes('--apply');
const DRY_RUN = process.argv.includes('--dry-run') || !APPLY;

function uniqueEmail(email, userId, usedEmails) {
  const base = (email || '').trim().toLowerCase();
  if (!base) {
    const fallback = `restored-${String(userId).slice(-8)}@harx-restored.local`;
    usedEmails.add(fallback);
    return fallback;
  }
  if (!usedEmails.has(base)) {
    usedEmails.add(base);
    return base;
  }
  const [local, domain] = base.split('@');
  if (!domain) {
    const fallback = `restored-${String(userId).slice(-8)}@harx-restored.local`;
    usedEmails.add(fallback);
    return fallback;
  }
  const tagged = `${local}+${String(userId).slice(-6)}@${domain}`;
  usedEmails.add(tagged);
  return tagged;
}

async function collectCandidates(db, existingIds, existingEmails) {
  const usedEmails = new Set(existingEmails);
  const candidates = new Map();

  const add = (userId, patch) => {
    const id = String(userId);
    if (existingIds.has(id)) return;
    const current = candidates.get(id) || {
      _id: new mongoose.Types.ObjectId(id),
      fullName: 'Unknown',
      email: '',
      phone: '+0000000000',
      typeUser: 'rep',
      isVerified: true,
      firstTime: false,
      sources: [],
    };
    candidates.set(id, {
      ...current,
      ...patch,
      sources: [...new Set([...(current.sources || []), ...(patch.sources || [])])],
    });
  };

  const agents = await db
    .collection('agents')
    .find({ userId: { $exists: true, $ne: null } })
    .project({
      userId: 1,
      'personalInfo.name': 1,
      'personalInfo.email': 1,
      'personalInfo.phone': 1,
      status: 1,
    })
    .toArray();

  for (const agent of agents) {
    add(agent.userId, {
      fullName: agent.personalInfo?.name || 'Unknown',
      email: (agent.personalInfo?.email || '').toLowerCase(),
      phone: agent.personalInfo?.phone || '+0000000000',
      typeUser: 'rep',
      sources: ['agents'],
    });
  }

  const gigs = await db
    .collection('gigs')
    .find({ userId: { $exists: true, $ne: null } })
    .project({ userId: 1, title: 1 })
    .toArray();
  for (const gig of gigs) {
    add(gig.userId, {
      fullName: gig.title ? `Company ${String(gig.userId).slice(-6)}` : 'Unknown',
      typeUser: 'company',
      sources: ['gigs'],
    });
  }

  const subs = await db
    .collection('subscriptions')
    .find({ userId: { $exists: true, $ne: null } })
    .project({ userId: 1, companyId: 1 })
    .toArray();
  for (const sub of subs) {
    add(sub.userId, {
      fullName: `Company ${String(sub.userId).slice(-6)}`,
      typeUser: 'company',
      sources: ['subscriptions'],
    });
  }

  const restored = [];
  for (const candidate of candidates.values()) {
    const email = uniqueEmail(candidate.email, candidate._id, usedEmails);
    restored.push({
      _id: candidate._id,
      fullName: candidate.fullName,
      email,
      phone: candidate.phone,
      typeUser: candidate.typeUser,
      isVerified: candidate.isVerified,
      firstTime: candidate.firstTime,
      sources: candidate.sources,
    });
  }

  restored.sort((a, b) => a.fullName.localeCompare(b.fullName));
  return restored;
}

async function main() {
  const uri = process.env.MONGODB_URI || DEFAULT_URI;
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const existingUsers = await db.collection('users').find({}).toArray();
  const existingIds = new Set(existingUsers.map((u) => String(u._id)));
  const existingEmails = new Set(existingUsers.map((u) => u.email?.toLowerCase()).filter(Boolean));

  const candidates = await collectCandidates(db, existingIds, existingEmails);
  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Users to restore: ${candidates.length}`);
  candidates.forEach((u) => {
    console.log(
      `${u._id} | ${u.fullName} | ${u.email} | ${u.typeUser} | ${u.sources.join(',')}`
    );
  });

  if (DRY_RUN) {
    console.log('\nRun with --apply to insert restored users.');
    await mongoose.disconnect();
    return;
  }

  const hashedPassword = await bcrypt.hash(TEMP_PASSWORD, 10);
  let inserted = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const exists = await User.findById(candidate._id);
    if (exists) {
      skipped += 1;
      continue;
    }
    await User.collection.insertOne({
      _id: candidate._id,
      fullName: candidate.fullName,
      email: candidate.email,
      phone: candidate.phone,
      password: hashedPassword,
      typeUser: candidate.typeUser,
      isVerified: candidate.isVerified,
      firstTime: candidate.firstTime,
      createdAt: new Date(),
    });
    inserted += 1;
  }

  console.log(`\nRestored ${inserted} users (${skipped} skipped).`);
  console.log(`Temporary password for restored accounts: ${TEMP_PASSWORD}`);
  console.log('Ask affected users to change their password after login.');

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
