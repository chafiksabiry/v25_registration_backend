#!/usr/bin/env node
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../v25_dash_rep_back/.env') });
dotenv.config();

function extractCloudinary(value, urls = new Set()) {
  if (!value) return urls;
  if (typeof value === 'string') {
    if (value.includes('res.cloudinary.com')) urls.add(value);
    return urls;
  }
  if (Array.isArray(value)) value.forEach((i) => extractCloudinary(i, urls));
  else if (typeof value === 'object') Object.values(value).forEach((i) => extractCloudinary(i, urls));
  return urls;
}

const USER_ID = '6a3d78b5fdf970b023cd2390';
const AGENT_ID = '6a403288ced08f5ef23a5b94';
const EMAIL = 'mamour.kasse.sn@gmail.com';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

console.log('=== Current agent videos ===');
const agent = await db.collection('agents').findOne({ _id: new mongoose.Types.ObjectId(AGENT_ID) });
(agent.experience || []).forEach((e, i) => {
  console.log(`${i + 1}. ${e.title} @ ${e.company}`);
  console.log(`   videoUrl: ${e.videoUrl || '-'}`);
  console.log(`   transcription: ${(e.videoTranscription || '').slice(0, 100)}`);
  console.log(`   analysis: ${e.videoAnalysis?.summary?.slice?.(0, 80) || e.videoAnalysis ? 'yes' : 'no'}`);
});
console.log('presentationVideo:', agent.personalInfo?.presentationVideo);

console.log('\n=== gigagents ===');
const gig = await db.collection('gigagents').find({
  $or: [
    { email: EMAIL },
    { 'personalInfo.email': EMAIL },
    { userId: new mongoose.Types.ObjectId(USER_ID) },
    { agentId: new mongoose.Types.ObjectId(AGENT_ID) },
  ],
}).toArray();
console.log('count:', gig.length);
gig.forEach((g) => {
  console.log('gigagent', g._id);
  (g.experience || []).forEach((e, i) => console.log(`  ${i + 1}. ${e.title} | ${e.videoUrl || '-'}`));
  for (const url of extractCloudinary(g)) console.log('  url:', url);
});

console.log('\n=== All agents with mamour email ===');
const all = await db.collection('agents').find({ 'personalInfo.email': EMAIL }).toArray();
all.forEach((a) => {
  console.log('agent', a._id, 'userId', a.userId);
  (a.experience || []).forEach((e, i) => console.log(`  ${i + 1}. ${e.title} | ${e.videoUrl || '-'}`));
});

console.log('\n=== Mongo scan for video URLs linked to userId/agentId ===');
for (const name of ['language_video_jobs', 'rep_progress', 'repprogresses', 'onboardingprogresses', 'calls']) {
  const exists = (await db.listCollections().toArray()).some((c) => c.name === name);
  if (!exists) continue;
  const docs = await db.collection(name).find({
    $or: [{ profileId: USER_ID }, { profileId: AGENT_ID }, { userId: USER_ID }, { agentId: USER_ID }],
  }).limit(20).toArray();
  if (docs.length) {
    console.log(name, docs.length);
    docs.forEach((d) => {
      for (const url of extractCloudinary(d)) console.log(' ', url);
      if (d.result) console.log(' result:', JSON.stringify(d.result).slice(0, 200));
    });
  }
}

await mongoose.disconnect();
