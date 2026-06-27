#!/usr/bin/env node
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

function extractAgentLike(doc) {
  const hasExp = Array.isArray(doc.experience) && doc.experience.some((e) => e?.videoUrl);
  const hasPhoto = doc.photo?.url || doc.personalInfo?.photo?.url;
  if (!hasExp && !hasPhoto) return null;
  return {
    _id: String(doc._id),
    email: doc.personalInfo?.email || doc.email,
    userId: doc.userId ? String(doc.userId) : null,
    photo: doc.photo?.url || doc.personalInfo?.photo?.url || null,
    videos: (doc.experience || []).filter((e) => e.videoUrl).map((e) => e.videoUrl),
    expCount: (doc.experience || []).length,
  };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const currentAgents = await db.collection('agents').find({}).toArray();
  const currentIds = new Set(currentAgents.map((a) => String(a._id)));
  const assignedUrls = new Set();
  for (const a of currentAgents) {
    const photo = a.photo?.url || a.personalInfo?.photo?.url;
    if (photo) assignedUrls.add(photo);
    for (const e of a.experience || []) {
      if (e.videoUrl) assignedUrls.add(e.videoUrl);
    }
  }

  console.log('=== Current agents ===');
  for (const a of currentAgents) {
    console.log(a.personalInfo?.email, String(a._id), 'videos', (a.experience || []).filter((e) => e.videoUrl).length);
  }

  console.log('\n=== Scan all collections for agent-like docs with media ===');
  const cols = (await db.listCollections().toArray()).map((c) => c.name);
  const orphans = [];

  for (const name of cols) {
    if (name === 'agents') continue;
    const cursor = db.collection(name).find({
      $or: [
        { 'personalInfo.photo.url': /cloudinary/ },
        { 'photo.url': /cloudinary/ },
        { 'experience.videoUrl': /cloudinary/ },
      ],
    });
    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      const info = extractAgentLike(doc);
      if (!info) continue;
      orphans.push({ collection: name, ...info });
    }
  }

  if (!orphans.length) {
    console.log('None found outside agents collection');
  } else {
    orphans.forEach((o) => console.log(JSON.stringify(o)));
  }

  await mongoose.disconnect();
}

main().catch(console.error);
