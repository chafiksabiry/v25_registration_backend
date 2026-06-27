#!/usr/bin/env node
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

function extractCloudinary(value, urls = new Set()) {
  if (!value) return urls;
  if (typeof value === 'string') {
    if (value.includes('res.cloudinary.com')) urls.add(value);
    return urls;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => extractCloudinary(item, urls));
    return urls;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach((item) => extractCloudinary(item, urls));
  }
  return urls;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const targets = [
    { email: 'mamour.kasse.sn@gmail.com', userId: '6a3d78b5fdf970b023cd2390' },
    { email: 'riksabiry@gmail.com', userId: '6a3af877846276a2eb123ac3' },
    { email: 'zdz89175@gmail.com', userId: '6a400ecafdd34156ea093dba' },
  ];

  const cols = [
    'calls',
    'reptransactions',
    'harxcommissions',
    'agentwithdrawals',
    'agentwallets',
    'gigagents',
    'walletledgerentries',
    'agentwalletledgerentries',
  ];

  for (const t of targets) {
    console.log(`\n=== ${t.email} ===`);
    const uid = new mongoose.Types.ObjectId(t.userId);
    const agent = await db.collection('agents').findOne({ userId: uid });
    console.log('agent', agent?._id);

    for (const name of cols) {
      const exists = (await db.listCollections().toArray()).some((c) => c.name === name);
      if (!exists) continue;
      const docs = await db
        .collection(name)
        .find({
          $or: [
            { userId: uid },
            { userId: t.userId },
            { agentId: uid },
            { agentId: t.userId },
            { agentId: agent?._id },
            { repId: uid },
            { repId: agent?._id },
          ],
        })
        .limit(5)
        .toArray();
      if (docs.length) {
        console.log(`  ${name}: ${docs.length}`);
        docs.forEach((d) => {
          const urls = [...extractCloudinary(d)];
          console.log(`    ${d._id}`, urls.length ? urls : Object.keys(d).slice(0, 8));
        });
      }
    }

    // orphan wallets with agentId near userId prefix
    const prefix = t.userId.slice(0, 8);
    const orphanWallets = await db.collection('agentwallets').find({}).toArray();
    for (const w of orphanWallets) {
      const aid = String(w.agentId);
      if (!aid.startsWith(prefix) && aid !== t.userId) continue;
      const oldAgent = await db
        .collection('agents')
        .findOne({ _id: new mongoose.Types.ObjectId(aid) })
        .catch(() => null);
      console.log(`  wallet agentId=${aid} agentExists=${!!oldAgent} created=${w.createdAt}`);
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
