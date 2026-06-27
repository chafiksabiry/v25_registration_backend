import mongoose from 'mongoose';

const AGENT_ID = '6a3d78b5fdf970b023cd2390';
const URI =
  process.env.MONGODB_URI ||
  'mongodb://mongo:DiGaBWUZXCkIxlZMuntztBaFJcOlUJIg@maglev.proxy.rlwy.net:40270/harx?authSource=admin';

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  const idStr = AGENT_ID;
  const idObj = new mongoose.Types.ObjectId(AGENT_ID);

  const collections = (await db.listCollections().toArray()).map((c) => c.name);
  for (const name of collections.sort()) {
    const col = db.collection(name);
    const countObj = await col.countDocuments({ $or: [{ _id: idObj }, { agentId: idObj }, { agentId: idStr }, { userId: idObj }, { userId: idStr }] }).catch(() => 0);
    if (countObj > 0) {
      console.log(`${name}: ${countObj}`);
      const docs = await col.find({ $or: [{ _id: idObj }, { agentId: idObj }, { agentId: idStr }, { userId: idObj }, { userId: idStr }] }).limit(1).toArray();
      console.log('  keys:', Object.keys(docs[0] || {}));
    }
  }

  // Sample a healthy agent for structure reference
  const sample = await db.collection('agents').findOne({});
  console.log('\nSample agent keys:', sample ? Object.keys(sample) : 'none');
  if (sample) {
    console.log(JSON.stringify({
      _id: sample._id,
      userId: sample.userId,
      status: sample.status,
      personalInfo: sample.personalInfo ? Object.keys(sample.personalInfo) : null,
      onboardingProgress: sample.onboardingProgress ? Object.keys(sample.onboardingProgress) : null,
    }, null, 2));
  }

  await mongoose.disconnect();
}

main().catch(console.error);
