import mongoose from 'mongoose';
import fs from 'fs';

const URI = process.env.MONGODB_URI;
if (!URI) {
  console.error('MONGODB_URI environment variable is required (set it in your shell, never in the code).');
  process.exit(1);
}

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  const agent = await db.collection('agents').findOne({ 'personalInfo.email': 'loubnaelfakiri@gmail.com' });
  fs.writeFileSync('scripts/sample-agent.json', JSON.stringify(agent, null, 2));
  console.log('written', agent?._id);
  await mongoose.disconnect();
}

main().catch(console.error);
