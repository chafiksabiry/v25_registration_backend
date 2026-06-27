#!/usr/bin/env node
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const agents = await db.collection('agents').find({}).toArray();
  const agentIds = new Set(agents.map((a) => String(a._id)));
  const wallets = await db.collection('agentwallets').find({}).toArray();

  for (const agent of agents) {
    const email = agent.personalInfo?.email;
    const userId = String(agent.userId || '');
    console.log(`\n=== ${email} ===`);
    console.log('current agent', agent._id, 'user', userId);

    const orphanIds = new Set();
    for (const w of wallets) {
      const aid = String(w.agentId);
      if (agentIds.has(aid)) continue;
      if (aid === userId || aid.startsWith(userId.slice(0, 8))) {
        orphanIds.add(aid);
        console.log(' orphan wallet agentId', aid, 'wallet', w._id, 'created', w.createdAt);
        console.log('  objectId date', new mongoose.Types.ObjectId(aid).getTimestamp());
      }
    }
  }

  console.log('\n=== Specific orphan lookups ===');
  for (const id of ['6a3d791cced08f5ef23a4c18', '6a3d792fb43eb24049dc8cbe']) {
    const w = await db.collection('agentwallets').findOne({
      $or: [{ agentId: id }, { agentId: new mongoose.Types.ObjectId(id) }],
    });
    console.log(id, w ? { wallet: String(w._id), agentId: String(w.agentId) } : 'none');
  }

  await mongoose.disconnect();
}

main().catch(console.error);
