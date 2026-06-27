#!/usr/bin/env node
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

function collectCloudinaryUrls(value, urls = new Set()) {
  if (!value) return urls;
  if (typeof value === 'string') {
    if (value.includes('res.cloudinary.com')) urls.add(value);
    return urls;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectCloudinaryUrls(item, urls));
    return urls;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach((item) => collectCloudinaryUrls(item, urls));
  }
  return urls;
}

async function checkUrl(url) {
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return response.status;
  } catch {
    return 0;
  }
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const agents = await db.collection('agents').find({}).toArray();
  const agentUrls = new Map();

  for (const agent of agents) {
    const urls = collectCloudinaryUrls(agent);
    agentUrls.set(String(agent._id), {
      email: agent.personalInfo?.email || agent.personalInfo?.name,
      userId: String(agent.userId || ''),
      urls: [...urls],
    });
  }

  console.log(`\n=== Agents (${agents.length}) ===`);
  const allUrls = new Set();
  for (const [agentId, info] of agentUrls) {
    console.log(`\n${info.email || agentId} (${agentId})`);
    if (!info.urls.length) {
      console.log('  (no cloudinary urls in document)');
      continue;
    }
    for (const url of info.urls) {
      allUrls.add(url);
      const status = await checkUrl(url);
      console.log(`  [${status}] ${url.slice(0, 100)}...`);
    }
  }

  // Search other collections for orphaned cloudinary refs by public_id patterns
  const publicIds = [...allUrls]
    .map((url) => url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z0-9]+)?(?:\?|$)/i)?.[1])
    .filter(Boolean);

  console.log(`\n=== Scan other collections for cloudinary traces (${publicIds.length} public ids) ===`);
  const collectionNames = (await db.listCollections().toArray()).map((c) => c.name);
  for (const name of collectionNames) {
    if (name === 'agents') continue;
    for (const pid of publicIds.slice(0, 5)) {
      const doc = await db.collection(name).findOne({
        $or: [
          { videoUrl: { $regex: pid, $options: 'i' } },
          { 'photo.url': { $regex: pid, $options: 'i' } },
          { 'personalInfo.photo.url': { $regex: pid, $options: 'i' } },
        ],
      });
      if (doc) {
        console.log(`  found ${pid} in ${name}`);
      }
    }
  }

  // Full text search in a few likely backup collections
  for (const name of ['gigagents', 'profiles', 'reps', 'repprogresses', 'calls']) {
    if (!collectionNames.includes(name)) continue;
    const sample = await db.collection(name).findOne({
      $where: 'function(){ return JSON.stringify(this).indexOf("cloudinary") >= 0; }',
    }).catch(() => null);
    if (sample) {
      const urls = [...collectCloudinaryUrls(sample)];
      console.log(`\n${name} has cloudinary sample:`, urls.slice(0, 3));
    }
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
