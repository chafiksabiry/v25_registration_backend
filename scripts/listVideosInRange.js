#!/usr/bin/env node
/**
 * List Cloudinary videos in a date range and who owns them in MongoDB.
 *
 * Usage:
 *   node scripts/listVideosInRange.js --from=2026-06-20 --to=2026-06-27
 *   node scripts/listVideosInRange.js --from=2026-06-20 --to=2026-06-27 --email=mamour.kasse.sn@gmail.com
 */
import dotenv from 'dotenv';
import fs from 'fs';
import mongoose from 'mongoose';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, '../../v25_dash_rep_back/package.json'));
const { v2: cloudinary } = require('cloudinary');

dotenv.config({ path: path.join(__dirname, '../../v25_dash_rep_back/.env') });
dotenv.config();

const fromArg = process.argv.find((a) => a.startsWith('--from='))?.split('=')[1] || '2026-06-20';
const toArg = process.argv.find((a) => a.startsWith('--to='))?.split('=')[1] || '2026-06-27';
const emailFilter = process.argv.find((a) => a.startsWith('--email='))?.split('=')[1];
const EXPORT = process.argv.includes('--export');

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

async function listResources(prefix, resourceType) {
  const results = [];
  let nextCursor;
  do {
    const response = await cloudinary.api.resources({
      type: 'upload',
      resource_type: resourceType,
      prefix,
      max_results: 500,
      next_cursor: nextCursor,
    });
    results.push(...(response.resources || []));
    nextCursor = response.next_cursor;
  } while (nextCursor);
  return results;
}

async function main() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const start = new Date(fromArg);
  const end = new Date(toArg);
  end.setHours(23, 59, 59, 999);

  const agents = await db.collection('agents').find({}).toArray();
  const urlToAgent = new Map();
  for (const agent of agents) {
    const email = agent.personalInfo?.email || '?';
    for (const url of extractCloudinary(agent)) {
      urlToAgent.set(url, { email, agentId: String(agent._id) });
    }
  }

  const [experienceVideos, presentationVideos] = await Promise.all([
    listResources('experience-videos/', 'video'),
    listResources('rep-profile-videos/', 'video'),
  ]);

  const inRange = (r) => {
    const created = new Date(r.created_at);
    return created >= start && created <= end;
  };

  console.log(`\n=== Videos ${fromArg} → ${toArg} ===\n`);

  console.log('--- experience-videos ---');
  const expInRange = experienceVideos.filter(inRange);
  console.log(`Total: ${expInRange.length} (${expInRange.filter((r) => !urlToAgent.has(r.secure_url)).length} unassigned)\n`);
  for (const r of expInRange) {
    const owner = urlToAgent.get(r.secure_url);
    const tag = owner ? `[${owner.email}]` : '[UNASSIGNED]';
    if (emailFilter && owner && owner.email !== emailFilter) continue;
    if (emailFilter && !owner) {
      // show unassigned when filtering for a user we're trying to recover
    }
    console.log(`${tag} ${r.created_at} | ${r.public_id}`);
    console.log(`  ${r.secure_url}`);
  }

  console.log('\n--- rep-profile-videos ---');
  const presInRange = presentationVideos.filter(inRange);
  console.log(`Total: ${presInRange.length} (${presInRange.filter((r) => !urlToAgent.has(r.secure_url)).length} unassigned)\n`);
  for (const r of presInRange) {
    const owner = urlToAgent.get(r.secure_url);
    const tag = owner ? `[${owner.email}]` : '[UNASSIGNED]';
    console.log(`${tag} ${r.created_at} | ${r.public_id}`);
    console.log(`  ${r.secure_url}`);
  }

  if (EXPORT) {
    const mapRow = (r, folder) => {
      const owner = urlToAgent.get(r.secure_url);
      return {
        folder,
        createdAt: r.created_at,
        publicId: r.public_id,
        url: r.secure_url,
        assignedTo: owner?.email || null,
        agentId: owner?.agentId || null,
      };
    };
    const payload = {
      from: fromArg,
      to: toArg,
      generatedAt: new Date().toISOString(),
      experienceVideos: expInRange.map((r) => mapRow(r, 'experience-videos')),
      presentationVideos: presInRange.map((r) => mapRow(r, 'rep-profile-videos')),
    };
    const out = path.join(__dirname, `cloudinary-videos-${fromArg}_to_${toArg}.json`);
    fs.writeFileSync(out, JSON.stringify(payload, null, 2));
    console.log(`\nExported: ${out}`);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
