#!/usr/bin/env node
/**
 * Delete specific QARA duplicate rep accounts (users + agents + wallets).
 *
 * Usage:
 *   node scripts/deleteQaraUsers.js --dry-run
 *   node scripts/deleteQaraUsers.js --apply
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const APPLY = process.argv.includes('--apply');
const TARGET_EMAILS = [
  'elhoucineqara250620261@yopmail.com',
  'elhoucineqarareps2306@yopmail.com',
];

const REF_FIELDS = ['userId', 'agentId', 'repId', 'ownerId'];

async function findRelatedDocs(db, userId, agentIds) {
  const userObj = new mongoose.Types.ObjectId(String(userId));
  const agentObjs = agentIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  const agentStrs = agentIds.map(String);
  const userStr = String(userId);

  const collections = (await db.listCollections().toArray()).map((c) => c.name);
  const related = [];

  for (const name of collections) {
    if (['users', 'agents', 'agentwallets'].includes(name)) continue;

    const or = [
      { userId: userObj },
      { userId: userStr },
      { agentId: { $in: agentObjs } },
      { agentId: { $in: agentStrs } },
      { repId: userObj },
      { repId: userStr },
      { ownerId: userObj },
      { ownerId: userStr },
    ];

    const count = await db.collection(name).countDocuments({ $or: or }).catch(() => 0);
    if (count > 0) {
      related.push({ collection: name, count });
    }
  }

  return related;
}

async function deleteForUser(db, user) {
  const agents = await db.collection('agents').find({ userId: user._id }).toArray();
  const agentIds = agents.map((agent) => agent._id);

  const wallets = agentIds.length
    ? await db.collection('agentwallets').find({ agentId: { $in: agentIds } }).toArray()
    : [];

  const related = await findRelatedDocs(db, user._id, agentIds);

  console.log(`\nUser ${user.fullName} <${user.email}> (${user._id})`);
  console.log(`  agents: ${agents.length}`, agentIds.map(String));
  console.log(`  wallets: ${wallets.length}`, wallets.map((w) => String(w._id)));
  if (related.length) {
    console.log('  other refs:', related);
  }

  if (!APPLY) return;

  for (const { collection, count } of related) {
    const userObj = user._id;
    const agentObjs = agentIds;
    const result = await db.collection(collection).deleteMany({
      $or: [
        { userId: userObj },
        { userId: String(userObj) },
        { agentId: { $in: agentObjs } },
        { agentId: { $in: agentObjs.map(String) } },
        { repId: userObj },
        { repId: String(userObj) },
        { ownerId: userObj },
        { ownerId: String(userObj) },
      ],
    });
    if (result.deletedCount) {
      console.log(`  deleted ${result.deletedCount} from ${collection}`);
    }
  }

  if (wallets.length) {
    const walletResult = await db.collection('agentwallets').deleteMany({ agentId: { $in: agentIds } });
    console.log(`  deleted ${walletResult.deletedCount} wallet(s)`);
  }

  if (agents.length) {
    const agentResult = await db.collection('agents').deleteMany({ _id: { $in: agentIds } });
    console.log(`  deleted ${agentResult.deletedCount} agent(s)`);
  }

  const userResult = await db.collection('users').deleteOne({ _id: user._id });
  console.log(`  deleted ${userResult.deletedCount} user(s)`);
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is required');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const users = await db.collection('users').find({ email: { $in: TARGET_EMAILS } }).toArray();
  console.log(`Found ${users.length} target user(s)`);

  if (!users.length) {
    await mongoose.disconnect();
    return;
  }

  if (!APPLY) {
    console.log('Dry run only. Re-run with --apply to delete.');
  }

  for (const user of users) {
    await deleteForUser(db, user);
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
