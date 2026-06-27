import mongoose from 'mongoose';
import fs from 'fs';

const URI =
  process.env.MONGODB_URI ||
  'mongodb://mongo:DiGaBWUZXCkIxlZMuntztBaFJcOlUJIg@maglev.proxy.rlwy.net:40270/harx?authSource=admin';

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  const agent = await db.collection('agents').findOne({ 'personalInfo.email': 'loubnaelfakiri@gmail.com' });
  fs.writeFileSync('scripts/sample-agent.json', JSON.stringify(agent, null, 2));
  console.log('written', agent?._id);
  await mongoose.disconnect();
}

main().catch(console.error);
