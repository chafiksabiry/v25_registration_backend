#!/usr/bin/env node
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const TARGET_EMAILS = [
  'mamour.kasse.sn@gmail.com',
  'riksabiry@gmail.com',
  'zdz89175@gmail.com',
  'rali.sabiry2018@gmail.com',
];

function extractCloudinaryUrls(value, urls = new Set()) {
  if (!value) return urls;
  if (typeof value === 'string') {
    if (value.includes('res.cloudinary.com')) urls.add(value);
    return urls;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => extractCloudinaryUrls(item, urls));
    return urls;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach((item) => extractCloudinaryUrls(item, urls));
  }
  return urls;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const collections = (await db.listCollections().toArray()).map((c) => c.name);

  for (const email of TARGET_EMAILS) {
    console.log(`\n=== ${email} ===`);
    let found = 0;

    for (const name of collections) {
      const col = db.collection(name);
      const docs = await col
        .find({
          $or: [{ email }, { 'personalInfo.email': email }],
        })
        .limit(5)
        .toArray()
        .catch(() => []);

      for (const doc of docs) {
        const urls = [...extractCloudinaryUrls(doc)];
        if (urls.length) {
          found += urls.length;
          console.log(`  ${name} / ${doc._id}:`);
          urls.forEach((url) => console.log(`    ${url}`));
        }
      }
    }

    if (!found) console.log('  No cloudinary URLs found in any collection for this email.');
  }

  // Orphan agents still in DB with cloudinary but maybe wrong userId
  console.log('\n=== All agents with cloudinary (by email) ===');
  const agents = await db.collection('agents').find({}).toArray();
  for (const agent of agents) {
    const urls = [...extractCloudinaryUrls(agent)];
    if (urls.length) {
      console.log(`${agent.personalInfo?.email} | ${urls.length} urls | userId=${agent.userId}`);
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
