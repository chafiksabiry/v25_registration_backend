#!/usr/bin/env node
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

function extractCloudinary(value, urls = new Set()) {
  if (!value) return urls;
  if (typeof value === 'string') {
    if (value.includes('res.cloudinary.com')) urls.add(value);
    return urls;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => extractCloudinary(item, urls));
    return urls;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach((item) => extractCloudinary(item, urls));
  }
  return urls;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  for (const name of ['language_video_jobs', 'rep_progress', 'repprogresses', 'onboardingprogresses']) {
    const col = db.collection(name);
    const total = await col.countDocuments({});
    console.log(`\n=== ${name} (${total} docs) ===`);
    const docs = await col.find({}).sort({ createdAt: -1 }).limit(30).toArray();
    for (const doc of docs) {
      const urls = [...extractCloudinary(doc)];
      console.log(
        `  ${doc._id} profileId=${doc.profileId || '-'} status=${doc.status || '-'} urls=${urls.length}`
      );
      urls.slice(0, 2).forEach((u) => console.log(`    ${u}`));
    }
  }

  const profileIds = [
    '6a3d78b5fdf970b023cd2390',
    '6a400d6c5cc77e5473256f28',
    '6a3af877846276a2eb123ac3',
    '6a400ecafdd34156ea093db8',
    '6a400ecafdd34156ea093dba',
    '6a400ecbfdd34156ea093dbb',
  ];

  console.log('\n=== language_video_jobs by profileId ===');
  for (const pid of profileIds) {
    const jobs = await db.collection('language_video_jobs').find({ profileId: pid }).toArray();
    if (jobs.length) {
      console.log(`profileId ${pid}: ${jobs.length} jobs`);
      jobs.forEach((j) => {
        const urls = [...extractCloudinary(j)];
        console.log(`  ${j._id} ${j.status} urls=${urls.length}`);
      });
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
