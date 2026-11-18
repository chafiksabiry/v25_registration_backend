import mongoose from 'mongoose';

const URI = process.env.MONGODB_URI;
if (!URI) {
  console.error('MONGODB_URI environment variable is required (set it in your shell, never in the code).');
  process.exit(1);
}

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  const patterns = [/elhoucineqara/i, /zdz89175/i, /rali/i, /tarik/i, /riksabiry/i];

  for (const p of patterns) {
    const agents = await db
      .collection('agents')
      .find({ $or: [{ 'personalInfo.email': p }, { 'personalInfo.name': p }] })
      .project({ _id: 1, userId: 1, 'personalInfo.name': 1, 'personalInfo.email': 1 })
      .toArray();
    if (agents.length) {
      console.log('\n', p, agents);
    }
  }

  const users = await db
    .collection('users')
    .find({ email: { $in: [/elhoucineqara/i, /zdz89175/i, /riksabiry/i, /nakbinakbi/i] } })
    .project({ _id: 1, email: 1, fullName: 1 })
    .toArray();
  console.log('\nusers', users);

  await mongoose.disconnect();
}

main().catch(console.error);
