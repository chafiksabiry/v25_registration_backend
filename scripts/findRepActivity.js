#!/usr/bin/env node
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const users = [
    { email: 'mamour.kasse.sn@gmail.com', userId: '6a3d78b5fdf970b023cd2390' },
    { email: 'riksabiry@gmail.com', userId: '6a3af877846276a2eb123ac3' },
    { email: 'zdz89175@gmail.com', userId: '6a400ecafdd34156ea093dba' },
  ];

  for (const u of users) {
    console.log(`\n=== ${u.email} ===`);
    console.log('userId date', new mongoose.Types.ObjectId(u.userId).getTimestamp());
    for (const name of ['reptransactions', 'harxcommissions', 'calls', 'gigagents']) {
      const docs = await db
        .collection(name)
        .find({
          $or: [
            { userId: new mongoose.Types.ObjectId(u.userId) },
            { userId: u.userId },
            { repId: new mongoose.Types.ObjectId(u.userId) },
          ],
        })
        .limit(3)
        .toArray()
        .catch(() => []);
      if (docs.length) {
        console.log(name, docs.map((d) => ({ _id: d._id, agentId: d.agentId, repId: d.repId })));
      }
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
