import mongoose from 'mongoose';

const URI =
  process.env.MONGODB_URI ||
  'mongodb://mongo:DiGaBWUZXCkIxlZMuntztBaFJcOlUJIg@maglev.proxy.rlwy.net:40270/harx?authSource=admin';

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;

  const wallets = await db.collection('agentwallets').find({}).toArray();
  const stringWallets = wallets.filter((w) => typeof w.agentId === 'string');
  console.log('string agentId wallets:', stringWallets.length);
  stringWallets.forEach((w) => console.log(w));

  const nabilUser = '6a3c087a51f15e390804a4ad';
  const nabilAgent = await db.collection('agents').findOne({ userId: new mongoose.Types.ObjectId(nabilUser) });
  console.log('\nNabil agent _id:', nabilAgent?._id);

  const mamourWallet = await db.collection('agentwallets').findOne({ agentId: '6a3d78b5fdf970b023cd2390' });
  console.log('\nMamour wallet:', mamourWallet);

  console.log('\nID range search skipped - using nearby agents by createdAt');

  const user = await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId('6a3d78b5fdf970b023cd2390') });
  if (user?.createdAt) {
    const from = new Date(user.createdAt.getTime() - 3600000);
    const to = new Date(user.createdAt.getTime() + 3600000);
    const nearby = await db.collection('agents').find({ createdAt: { $gte: from, $lte: to } }).project({ _id: 1, userId: 1, 'personalInfo.name': 1, createdAt: 1 }).toArray();
    console.log('\nAgents created +/-1h of user restore time:', nearby.length);
    nearby.forEach((a) => console.log(a));
  }

  // Export Nabil as template
  if (nabilAgent) {
    const fs = await import('fs');
    fs.writeFileSync('scripts/sample-agent-nabil.json', JSON.stringify(nabilAgent, null, 2));
    console.log('\nExported Nabil agent template');
  }

  await mongoose.disconnect();
}

main().catch(console.error);
