import mongoose from 'mongoose';

const USER_ID = '6a3d78b5fdf970b023cd2390';
const URI =
  process.env.MONGODB_URI ||
  'mongodb://mongo:DiGaBWUZXCkIxlZMuntztBaFJcOlUJIg@maglev.proxy.rlwy.net:40270/harx?authSource=admin';

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  const needles = [USER_ID, 'Mamour', 'mamour.kasse', 'Kass'];

  for (const name of (await db.listCollections().toArray()).map((c) => c.name).sort()) {
    if (name === 'agents') continue;
    const col = db.collection(name);
    let docs;
    try {
      docs = await col
        .find({
          $or: [
            { userId: new mongoose.Types.ObjectId(USER_ID) },
            { agentId: new mongoose.Types.ObjectId(USER_ID) },
            { repId: new mongoose.Types.ObjectId(USER_ID) },
            { 'personalInfo.email': /mamour/i },
            { email: /mamour/i },
            { fullName: /mamour/i },
          ],
        })
        .limit(3)
        .toArray();
    } catch {
      continue;
    }
    if (docs.length) {
      console.log(`\n=== ${name} (${docs.length}) ===`);
      docs.forEach((d) => console.log(JSON.stringify({ _id: d._id, userId: d.userId, agentId: d.agentId, repId: d.repId, name: d.fullName || d.personalInfo?.name, email: d.email || d.personalInfo?.email }, null, 2)));
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
