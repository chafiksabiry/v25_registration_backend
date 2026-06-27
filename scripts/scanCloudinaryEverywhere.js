#!/usr/bin/env node
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { createRequire } from 'module';
import path from 'path';
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

async function listTrash(prefix, resourceType) {
  const results = [];
  let nextCursor;
  do {
    const response = await new Promise((resolve, reject) => {
      cloudinary.api.call_api(
        'get',
        ['resources', resourceType, 'trash'],
        { prefix, max_results: 500, next_cursor: nextCursor },
        (err, res) => (err ? reject(err) : resolve(res))
      );
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

  // URLs already assigned in agents
  const agents = await db.collection('agents').find({}).toArray();
  const assignedUrls = new Set();
  const agentByUrl = new Map();
  for (const agent of agents) {
    for (const url of extractCloudinary(agent)) {
      assignedUrls.add(url);
      agentByUrl.set(url, agent.personalInfo?.email || String(agent._id));
    }
  }

  console.log('\n=== Cloudinary active resources ===');
  const [photos, videos, deletedPhotos, deletedVideos] = await Promise.all([
    listResources('rep-profile-photos/', 'image'),
    listResources('experience-videos/', 'video'),
    listTrash('rep-profile-photos/', 'image').catch(() => []),
    listTrash('experience-videos/', 'video').catch(() => []),
  ]);

  console.log(`Photos: ${photos.length} active, ${deletedPhotos.length} deleted`);
  console.log(`Videos: ${videos.length} active, ${deletedVideos.length} deleted`);

  const unassignedPhotos = photos.filter((r) => !assignedUrls.has(r.secure_url));
  const unassignedVideos = videos.filter((r) => !assignedUrls.has(r.secure_url));

  console.log(`\nUnassigned photos (${unassignedPhotos.length}):`);
  unassignedPhotos.forEach((r) =>
    console.log(`  ${r.created_at} | ${r.public_id} | ${r.secure_url}`)
  );

  console.log(`\nUnassigned videos (${unassignedVideos.length}):`);
  unassignedVideos.forEach((r) =>
    console.log(`  ${r.created_at} | ${r.public_id} | ${r.secure_url}`)
  );

  if (deletedPhotos.length || deletedVideos.length) {
    console.log('\n=== Deleted (restorable) ===');
    deletedPhotos.forEach((r) => console.log(`  PHOTO ${r.public_id} (${r.deleted_at})`));
    deletedVideos.forEach((r) => console.log(`  VIDEO ${r.public_id} (${r.deleted_at})`));
  }

  console.log('\n=== Assigned URLs map ===');
  for (const [url, email] of agentByUrl) {
    console.log(`${email}: ${url.slice(-60)}`);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
