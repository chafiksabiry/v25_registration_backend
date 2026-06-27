#!/usr/bin/env node
/**
 * Export unassigned Cloudinary media (photos + experience videos) to JSON.
 * Use this list to manually match URLs to users, then apply via recoverCloudinaryMedia.js --apply-mapping
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, '../../v25_dash_rep_back/package.json'));
const { v2: cloudinary } = require('cloudinary');

dotenv.config({ path: path.join(__dirname, '../../v25_dash_rep_back/.env') });
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

function configureCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
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
  configureCloudinary();
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const assignedUrls = new Set();
  const agents = await db.collection('agents').find({}).toArray();
  for (const agent of agents) {
    for (const url of extractCloudinary(agent)) assignedUrls.add(url);
  }

  const [photos, videos] = await Promise.all([
    listResources('rep-profile-photos/', 'image'),
    listResources('experience-videos/', 'video'),
  ]);

  const payload = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalPhotos: photos.length,
      totalVideos: videos.length,
      assignedUrls: assignedUrls.size,
      unassignedPhotos: photos.filter((r) => !assignedUrls.has(r.secure_url)).length,
      unassignedVideos: videos.filter((r) => !assignedUrls.has(r.secure_url)).length,
    },
    assigned: agents.map((a) => ({
      email: a.personalInfo?.email,
      agentId: String(a._id),
      urls: [...extractCloudinary(a)],
    })),
    unassignedPhotos: photos
      .filter((r) => !assignedUrls.has(r.secure_url))
      .map((r) => ({
        created_at: r.created_at,
        public_id: r.public_id,
        url: r.secure_url,
      })),
    unassignedVideos: videos
      .filter((r) => !assignedUrls.has(r.secure_url))
      .map((r) => ({
        created_at: r.created_at,
        public_id: r.public_id,
        url: r.secure_url,
      })),
  };

  const out = path.join(__dirname, 'unassigned-cloudinary-media.json');
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`Exported ${out}`);
  console.log(JSON.stringify(payload.summary, null, 2));

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
