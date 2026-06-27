#!/usr/bin/env node
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();

const TARGET_EMAILS = [
  'mamour.kasse.sn@gmail.com',
  'riksabiry@gmail.com',
  'zdz89175@gmail.com',
  'rali.sabiry2018@gmail.com',
  'nakbinakbi@gmail.com',
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

  const gigagents = await db.collection('gigagents').find({}).toArray();
  console.log(`gigagents total: ${gigagents.length}`);

  const withCloud = [];
  for (const doc of gigagents) {
    const urls = [...extractCloudinary(doc)];
    if (urls.length) withCloud.push({ doc, urls });
  }
  console.log(`with cloudinary: ${withCloud.length}`);

  for (const email of TARGET_EMAILS) {
    const matches = gigagents.filter(
      (d) =>
        d.email === email ||
        d.personalInfo?.email === email ||
        JSON.stringify(d).includes(email)
    );
    console.log(`\n=== ${email} (${matches.length} gigagents) ===`);
    for (const doc of matches) {
      const urls = [...extractCloudinary(doc)];
      console.log(`  _id=${doc._id} userId=${doc.userId} agentId=${doc.agentId}`);
      console.log(`  exp=${doc.experience?.length || 0} urls=${urls.length}`);
      urls.forEach((u) => console.log(`    ${u}`));
      fs.writeFileSync(
        path.join(__dirname, `gigagent-${email.replace(/[@.]/g, '_')}.json`),
        JSON.stringify(doc, null, 2)
      );
    }
  }

  // Show all gigagents emails
  console.log('\n=== All gigagents emails ===');
  for (const doc of gigagents) {
    const email = doc.personalInfo?.email || doc.email || '?';
    const urls = [...extractCloudinary(doc)].length;
    console.log(`${email} | urls=${urls} | exp=${doc.experience?.length || 0}`);
  }

  await mongoose.disconnect();
}

main().catch(console.error);
