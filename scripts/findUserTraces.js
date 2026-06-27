#!/usr/bin/env node
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const EMAILS = [
  'mamour.kasse.sn@gmail.com',
  'riksabiry@gmail.com',
  'zdz89175@gmail.com',
];

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
  const cols = (await db.listCollections().toArray()).map((c) => c.name);

  for (const email of EMAILS) {
    const user = await db.collection('users').findOne({ email });
    const uid = user?._id;
    const agent = uid ? await db.collection('agents').findOne({ userId: uid }) : null;
    console.log(`\n=== ${email} ===`);
    console.log(`userId=${uid} agentId=${agent?._id}`);

    for (const name of cols) {
      const q = {
        $or: [
          { userId: uid },
          { userId: String(uid) },
          { agentId: uid },
          { agentId: String(uid) },
          { repId: uid },
          { profileId: String(uid) },
          { profileId: agent?._id ? String(agent._id) : null },
          { 'personalInfo.email': email },
          { email },
        ].filter((part) => Object.values(part).every((v) => v != null)),
      };
      const docs = await db.collection(name).find(q).limit(3).toArray();
      if (!docs.length) continue;
      console.log(`  ${name}: ${docs.length}+ docs`);
      for (const doc of docs) {
        const urls = [...extractCloudinary(doc)];
        console.log(`    _id=${doc._id} keys=${Object.keys(doc).slice(0, 12).join(',')}`);
        if (urls.length) urls.forEach((u) => console.log(`      ${u}`));
        if (doc.onboardingProgress) console.log(`      onboarding phases:`, Object.keys(doc.onboardingProgress.phases || {}));
        if (doc.experience?.length) console.log(`      experiences: ${doc.experience.length}`);
      }
    }
  }

  console.log('\n=== Job-like collections ===');
  console.log(cols.filter((n) => /video|job|progress|language|analysis/i.test(n)).join(', '));

  await mongoose.disconnect();
}

main().catch(console.error);
