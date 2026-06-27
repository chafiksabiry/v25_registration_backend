import mongoose from 'mongoose';

const URI = process.env.MONGODB_URI || 'mongodb://mongo:DiGaBWUZXCkIxlZMuntztBaFJcOlUJIg@maglev.proxy.rlwy.net:40270/harx?authSource=admin';

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;

  const userId = new mongoose.Types.ObjectId('6a3af877846276a2eb123ac3');
  const agentId = new mongoose.Types.ObjectId('6a400ecafdd34156ea093db8');

  const wallets = await db
    .collection('agentwallets')
    .find({ $or: [{ agentId: userId }, { agentId }] })
    .toArray();
  console.log('before', wallets.map((w) => ({ _id: w._id, agentId: w.agentId })));

  const good = wallets.find((w) => String(w.agentId) === String(agentId));
  const bad = wallets.filter((w) => String(w.agentId) !== String(agentId));
  for (const w of bad) {
    await db.collection('agentwallets').deleteOne({ _id: w._id });
  }
  if (!good) {
    await db.collection('agentwallets').insertOne({
      agentId,
      availableBalance: 0,
      pendingWithdrawals: 0,
      pendingCommissions: 0,
      lifetimeEarnings: 0,
      pendingRetraction: 0,
      pendingCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const nabil = await db.collection('agents').findOne(
    { _id: new mongoose.Types.ObjectId('6a3c08edced08f5ef23a2a71') },
    {
      projection: {
        status: 1,
        'onboardingProgress.currentPhase': 1,
        experience: { $size: '$experience' },
        'personalInfo.languages': { $size: '$personalInfo.languages' },
      },
    }
  );
  console.log('after', await db.collection('agentwallets').find({ agentId }).toArray());
  console.log('nabil', nabil);

  await mongoose.disconnect();
}

main().catch(console.error);
