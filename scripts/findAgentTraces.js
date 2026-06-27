import mongoose from 'mongoose';

const USER_ID = '6a3d78b5fdf970b023cd2390';
const URI =
  process.env.MONGODB_URI ||
  'mongodb://mongo:DiGaBWUZXCkIxlZMuntztBaFJcOlUJIg@maglev.proxy.rlwy.net:40270/harx?authSource=admin';

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  const uid = new mongoose.Types.ObjectId(USER_ID);

  const collections = (await db.listCollections().toArray()).map((c) => c.name);
  for (const name of collections.sort()) {
    if (name === 'users' || name === 'agents') continue;
    const col = db.collection(name);
    const queries = [
      { userId: uid },
      { userId: USER_ID },
      { agentId: uid },
      { agentId: USER_ID },
      { repId: uid },
      { 'personalInfo.email': 'mamour.kasse.sn@gmail.com' },
      { email: 'mamour.kasse.sn@gmail.com' },
    ];
    for (const q of queries) {
      try {
        const count = await col.countDocuments(q);
        if (count > 0) {
          console.log(`\n=== ${name} | ${JSON.stringify(q)} | count=${count} ===`);
          const sample = await col.find(q).limit(2).toArray();
          sample.forEach((doc) => {
            console.log(JSON.stringify(doc, null, 2).slice(0, 2000));
          });
        }
      } catch {
        /* ignore invalid query shapes */
      }
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
