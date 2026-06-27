import mongoose from 'mongoose';

const URI =
  process.env.MONGODB_URI ||
  'mongodb://mongo:DiGaBWUZXCkIxlZMuntztBaFJcOlUJIg@maglev.proxy.rlwy.net:40270/harx?authSource=admin';

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  const wallets = await db.collection('agentwallets').find({}).limit(5).toArray();
  const pairs = await db.collection('agents').find({}).project({ _id: 1, userId: 1 }).limit(5).toArray();
  console.log('wallets', wallets.map((w) => ({ agentId: w.agentId, type: typeof w.agentId })));
  console.log('agents', pairs);
  await mongoose.disconnect();
}

main().catch(console.error);
