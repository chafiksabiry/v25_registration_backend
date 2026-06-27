import mongoose from 'mongoose';

const USER_ID = '6a3d78b5fdf970b023cd2390';
const URI =
  process.env.MONGODB_URI ||
  'mongodb://mongo:DiGaBWUZXCkIxlZMuntztBaFJcOlUJIg@maglev.proxy.rlwy.net:40270/harx?authSource=admin';

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  const regex = new RegExp(USER_ID.slice(-8), 'i');

  for (const name of ['rep_progress', 'repprogresses', 'onboardingprogresses', 'profiles', 'reps', 'repsubscriptions', 'rep_notifications', 'training_journeys', 'gigagents']) {
    const col = db.collection(name);
    const count = await col.countDocuments({
      $or: [
        { userId: USER_ID },
        { agentId: USER_ID },
        { repId: USER_ID },
      ],
    }).catch(async () => {
      return col.countDocuments({ $text: { $search: USER_ID } }).catch(() => 0);
    });
    if (count > 0) {
      console.log(`\n${name}: ${count}`);
      const docs = await col.find({
        $or: [{ userId: USER_ID }, { agentId: USER_ID }, { repId: USER_ID }],
      }).limit(2).toArray();
      docs.forEach((d) => console.log(JSON.stringify(d, null, 2).slice(0, 3000)));
    }
  }

  // Deep string search in a few likely collections
  const deepCols = ['calls', 'certifications', 'documents', 'analyses'];
  for (const name of deepCols) {
    const col = db.collection(name);
    const docs = await col.find({}).limit(500).toArray();
    const hits = docs.filter((d) => JSON.stringify(d).includes(USER_ID));
    if (hits.length) {
      console.log(`\n${name} string hits: ${hits.length}`);
      console.log(JSON.stringify(hits[0], null, 2).slice(0, 2000));
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
