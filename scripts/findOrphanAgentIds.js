#!/usr/bin/env node
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const gigagents = await db.collection('gigagents').find({}).toArray();
  const agentIds = [...new Set(gigagents.map((g) => String(g.agentId)).filter(Boolean))];
  console.log(`Unique agentIds in gigagents: ${agentIds.length}`);

  const missing = [];
  for (const aid of agentIds) {
    let agent = null;
    try {
      agent = await db.collection('agents').findOne({ _id: new mongoose.Types.ObjectId(aid) });
    } catch {
      agent = null;
    }
    if (!agent) missing.push(aid);
  }
  console.log(`Missing from agents collection: ${missing.length}`);

  for (const aid of missing.slice(0, 20)) {
    const wallet = await db.collection('agentwallets').findOne({
      $or: [{ agentId: aid }, { agentId: new mongoose.Types.ObjectId(aid) }],
    });
    const gigs = gigagents.filter((g) => String(g.agentId) === aid).length;
    console.log(`  ${aid} | gigs=${gigs} | wallet=${wallet ? wallet._id : 'none'}`);
    if (wallet) {
      console.log(`    wallet keys:`, Object.keys(wallet).join(','));
      console.log(`    userId=${wallet.userId} email=${wallet.email || wallet.ownerEmail || '-'}`);
    }
  }

  // Wallets pointing to deleted agentIds
  const wallets = await db.collection('agentwallets').find({}).toArray();
  console.log(`\nagentwallets: ${wallets.length}`);
  for (const w of wallets) {
    const aid = String(w.agentId);
    let agent = null;
    try {
      agent = await db.collection('agents').findOne({ _id: new mongoose.Types.ObjectId(aid) });
    } catch {
      agent = await db.collection('agents').findOne({ userId: new mongoose.Types.ObjectId(aid) });
    }
    if (!agent) {
      console.log(`  orphan wallet ${w._id} agentId=${aid}`);
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
