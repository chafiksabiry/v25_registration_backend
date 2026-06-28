#!/usr/bin/env node
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../v25_dash_rep_back/.env') });
dotenv.config();

const urls = [
  'exp-1782370960951',
  'exp-1782372388846',
  'exp-1782320659243',
];

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

for (const needle of urls) {
  console.log(`\n=== Search: ${needle} ===`);
  const agents = await db.collection('agents').find({
    $or: [
      { 'experience.videoUrl': { $regex: needle } },
      { 'personalInfo.presentationVideo.url': { $regex: needle } },
    ],
  }).toArray();
  agents.forEach((a) => {
    console.log('agent', a._id, a.personalInfo?.email);
    (a.experience || []).filter((e) => e.videoUrl?.includes(needle)).forEach((e) => {
      console.log(`  ${e.title} @ ${e.company}`);
      console.log(`  transcription: ${(e.videoTranscription || '').slice(0, 120)}`);
    });
  });
}

// Search any collection for these URLs in raw JSON
const cols = (await db.listCollections().toArray()).map((c) => c.name);
for (const name of cols) {
  for (const needle of urls) {
    const docs = await db.collection(name).find({ $text: { $search: needle } }).limit(3).toArray().catch(() => []);
    if (docs.length) console.log(`\n${name} has ${needle}:`, docs.length);
  }
}

// Broader regex search in agents for any historical mamour traces with videoAnalysis
const historical = await db.collection('agents').find({
  'personalInfo.email': /mamour/i,
  'experience.videoAnalysis': { $exists: true },
}).toArray();
console.log('\n=== Mamour agents with videoAnalysis ===', historical.length);
historical.forEach((a) => {
  console.log(a._id);
  (a.experience || []).forEach((e, i) => {
    if (e.videoUrl) console.log(`  ${i + 1}. ${e.title} | ${e.videoUrl.slice(-40)} | analysis: ${!!e.videoAnalysis}`);
  });
});

await mongoose.disconnect();
