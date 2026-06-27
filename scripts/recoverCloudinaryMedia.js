#!/usr/bin/env node
/**
 * Search MongoDB + Cloudinary for recoverable media (photos, experience videos).
 *
 * Run from v25_dash_rep_back (has cloudinary dependency):
 *   node ../v25_registration_backend/scripts/recoverCloudinaryMedia.js --audit
 *   node ../v25_registration_backend/scripts/recoverCloudinaryMedia.js --list-deleted
 *   node ../v25_registration_backend/scripts/recoverCloudinaryMedia.js --email mamour.kasse.sn@gmail.com
 */
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

const LIST_DELETED = process.argv.includes('--list-deleted');
const AUDIT = process.argv.includes('--audit') || (!LIST_DELETED && !process.argv.some((a) => a.includes('@')));
const emailArg = process.argv.find((a) => a.includes('@'));

function configureCloudinary() {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) {
    throw new Error('Missing CLOUDINARY_* env vars');
  }
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
}

function collectMedia(agent) {
  const items = [];
  const photo = agent.photo || agent.personalInfo?.photo;
  if (photo?.url) items.push({ type: 'photo', url: photo.url, publicId: photo.publicId });
  for (const exp of agent.experience || []) {
    if (exp.videoUrl) {
      items.push({
        type: 'experience_video',
        url: exp.videoUrl,
        title: exp.title || exp.title_i18n?.fr || exp.title_i18n?.en,
      });
    }
  }
  return items;
}

async function searchCloudinaryByPrefix(prefix, resourceType) {
  const results = [];
  let nextCursor;
  do {
    const response = await cloudinary.api.resources({
      type: 'upload',
      resource_type: resourceType,
      prefix,
      max_results: 100,
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

async function auditAgents(db) {
  const agents = await db.collection('agents').find({}).toArray();
  console.log(`\n=== Agent media audit (${agents.length}) ===\n`);

  for (const agent of agents) {
    const media = collectMedia(agent);
    const email = agent.personalInfo?.email || '?';
    console.log(`${email} | agent ${agent._id}`);
    if (!media.length) {
      console.log('  MISSING: no photo/video URLs in MongoDB\n');
      continue;
    }
    for (const item of media) {
      try {
        const res = await fetch(item.url, { method: 'HEAD' });
        console.log(`  [${res.status}] ${item.type}: ${item.url.slice(0, 95)}...`);
      } catch {
        console.log(`  [ERR] ${item.type}`);
      }
    }
    console.log('');
  }
}

async function suggestRecoveryForEmail(db, email) {
  configureCloudinary();
  const user = await db.collection('users').findOne({ email });
  const agent = user
    ? await db.collection('agents').findOne({ userId: user._id })
    : await db.collection('agents').findOne({ 'personalInfo.email': email });

  console.log(`\n=== Recovery analysis: ${email} ===`);
  if (!agent) {
    console.log('No agent found.');
    return;
  }

  const current = collectMedia(agent);
  console.log(`Media URLs in MongoDB: ${current.length}`);
  console.log(`Experiences in DB: ${(agent.experience || []).length}`);

  const [photos, videos, deletedPhotos, deletedVideos] = await Promise.all([
    searchCloudinaryByPrefix('rep-profile-photos/', 'image'),
    searchCloudinaryByPrefix('experience-videos/', 'video'),
    listTrash('rep-profile-photos/', 'image').catch(() => []),
    listTrash('experience-videos/', 'video').catch(() => []),
  ]);

  console.log(`Cloudinary active: ${photos.length} photos, ${videos.length} videos`);
  console.log(`Cloudinary deleted (restorable): ${deletedPhotos.length} photos, ${deletedVideos.length} videos`);

  if (deletedPhotos.length) {
    console.log('\nDeleted photos:');
    deletedPhotos.forEach((r) => console.log(`  ${r.public_id} (${r.deleted_at})`));
  }
  if (deletedVideos.length) {
    console.log('\nDeleted videos:');
    deletedVideos.forEach((r) => console.log(`  ${r.public_id} (${r.deleted_at})`));
  }

  if (!current.some((m) => m.type === 'photo')) {
    console.log('\nProfile photo absent from MongoDB — derniers uploads Cloudinary:');
    photos.slice(-8).forEach((r) => console.log(`  ${r.created_at} | ${r.secure_url}`));
  }
  if (!(agent.experience || []).some((e) => e.videoUrl)) {
    console.log('\nVideos expérience absents du MongoDB — derniers uploads Cloudinary:');
    videos.slice(-12).forEach((r) => console.log(`  ${r.created_at} | ${r.secure_url}`));
  }
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI required');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  if (AUDIT) await auditAgents(db);

  if (LIST_DELETED) {
    configureCloudinary();
    const deletedPhotos = await listTrash('rep-profile-photos/', 'image').catch(() => []);
    const deletedVideos = await listTrash('experience-videos/', 'video').catch(() => []);
    console.log(`\n=== Cloudinary trash ===`);
    console.log(`Deleted photos: ${deletedPhotos.length}`);
    deletedPhotos.forEach((r) => console.log(`  ${r.public_id}`));
    console.log(`Deleted videos: ${deletedVideos.length}`);
    deletedVideos.forEach((r) => console.log(`  ${r.public_id}`));
  }

  if (emailArg) await suggestRecoveryForEmail(db, emailArg);

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
