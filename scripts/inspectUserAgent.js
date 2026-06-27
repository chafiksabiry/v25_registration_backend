import mongoose from 'mongoose';

const USER_ID = '6a3d78b5fdf970b023cd2390';
const URI =
  process.env.MONGODB_URI ||
  'mongodb://mongo:DiGaBWUZXCkIxlZMuntztBaFJcOlUJIg@maglev.proxy.rlwy.net:40270/harx?authSource=admin';

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;

  const user = await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(USER_ID) });
  console.log('=== user ===');
  console.log(user ? JSON.stringify(user, null, 2) : 'NOT FOUND');

  const agents = await db
    .collection('agents')
    .find({ userId: new mongoose.Types.ObjectId(USER_ID) })
    .toArray();
  console.log('\n=== agents for userId ===', agents.length);
  agents.forEach((a) => {
    console.log(JSON.stringify({ _id: a._id, userId: a.userId, name: a.personalInfo?.name, email: a.personalInfo?.email, status: a.status }, null, 2));
  });

  const agentsByEmail = await db
    .collection('agents')
    .find({ 'personalInfo.email': /mamour|kass/i })
    .project({ _id: 1, userId: 1, 'personalInfo.name': 1, 'personalInfo.email': 1, status: 1 })
    .toArray();
  console.log('\n=== agents matching mamour/kass ===', agentsByEmail.length);
  agentsByEmail.forEach((a) => console.log(JSON.stringify(a)));

  await mongoose.disconnect();
}

main().catch(console.error);
