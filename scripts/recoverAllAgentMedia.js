#!/usr/bin/env node
/**
 * Recover photo + experience videos for all agents in MongoDB.
 *
 * 1. Scan MongoDB collections for orphan cloudinary URLs linked to agent/user
 * 2. Match unassigned Cloudinary uploads to orphan wallet agentIds (by ObjectId date)
 * 3. Verify URLs, normalize personalInfo.photo, patch agents
 *
 * Usage:
 *   node scripts/recoverAllAgentMedia.js --dry-run
 *   node scripts/recoverAllAgentMedia.js --apply
 *   node scripts/recoverAllAgentMedia.js --apply --mapping scripts/agent-media-mapping.json
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

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const mappingArg = process.argv.find((a) => a.startsWith('--mapping='));
const mappingPath = mappingArg
  ? mappingArg.split('=')[1]
  : path.join(__dirname, 'agent-media-mapping.json');

function configureCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

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

function publicIdFromUrl(url) {
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z0-9]+)?(?:\?|$)/i);
  return match?.[1] || null;
}

function photoPayload(url) {
  return {
    url,
    publicId: publicIdFromUrl(url),
  };
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

async function checkUrl(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return res.status;
  } catch {
    return 0;
  }
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

async function restoreTrash(publicId, resourceType) {
  return new Promise((resolve, reject) => {
    cloudinary.api.call_api(
      'post',
      ['resources', resourceType, 'restore'],
      { public_ids: [publicId] },
      (err, res) => (err ? reject(err) : resolve(res))
    );
  });
}

function objectIdDate(id) {
  try {
    return new mongoose.Types.ObjectId(String(id)).getTimestamp();
  } catch {
    return null;
  }
}

function withinMs(a, b, ms) {
  return Math.abs(a.getTime() - b.getTime()) <= ms;
}

async function ensureRepUser(db, agent) {
  if (!agent?.userId) return null;
  const email = agent.personalInfo?.email;
  if (!email) return null;

  return {
    _id: agent.userId,
    fullName: agent.personalInfo?.name || email,
    email,
    phone: agent.personalInfo?.phone || '+0000000000',
    typeUser: 'rep',
    isVerified: true,
    firstTime: false,
    createdAt: objectIdDate(agent.userId) || new Date(),
    updatedAt: new Date(),
  };
}

function getReferenceDates(userId, wallets, agentIds) {
  const dates = [];
  if (userId) {
    const d = objectIdDate(userId);
    if (d) dates.push(d);
  }

  for (const w of wallets) {
    const aid = String(w.agentId);
    if (agentIds.has(aid)) continue;
    const dt = objectIdDate(aid);
    if (!dt) continue;
    for (const ref of dates) {
      if (withinMs(dt, ref, 3 * 3600 * 1000)) {
        dates.push(dt);
        break;
      }
    }
  }

  return [...new Set(dates.map((d) => d.getTime()))].map((t) => new Date(t));
}

function pickUnassignedPhoto(unassignedPhotos, dates, usedUrls) {
  const candidates = unassignedPhotos
    .filter((r) => !usedUrls.has(r.secure_url))
    .filter((r) => dates.some((dt) => withinMs(new Date(r.created_at), dt, 36 * 3600 * 1000)))
    .sort((a, b) => {
      const da = dates[0];
      return Math.abs(new Date(a.created_at) - da) - Math.abs(new Date(b.created_at) - da);
    });
  return candidates[0] || null;
}

function pickUnassignedVideos(unassignedVideos, dates, usedUrls, max = 6) {
  return unassignedVideos
    .filter((r) => !usedUrls.has(r.secure_url))
    .filter((r) => dates.some((dt) => withinMs(new Date(r.created_at), dt, 36 * 3600 * 1000)))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .slice(0, max)
    .map((r) => r.secure_url);
}

async function scanMongoForUrls(db, needles) {
  const found = new Set();
  const cols = [
    'calls',
    'reptransactions',
    'harxcommissions',
    'agentwithdrawals',
    'language_video_jobs',
    'profiles',
    'reps',
  ];

  for (const name of cols) {
    const exists = (await db.listCollections().toArray()).some((c) => c.name === name);
    if (!exists) continue;

    for (const needle of needles) {
      if (!needle || needle.length < 4) continue;
      const docs = await db
        .collection(name)
        .find({
          $or: [
            { userId: needle },
            { agentId: needle },
            { repId: needle },
            { profileId: needle },
            { email: needle },
            { 'personalInfo.email': needle },
          ],
        })
        .limit(20)
        .toArray()
        .catch(() => []);

      for (const doc of docs) {
        for (const url of extractCloudinary(doc)) found.add(url);
      }
    }
  }

  return [...found];
}

function getPhoto(agent) {
  return agent.photo?.url || agent.personalInfo?.photo?.url || null;
}

function getVideoUrls(agent) {
  return (agent.experience || []).map((e) => e.videoUrl).filter(Boolean);
}

function buildUpdate(agent, photoUrl, videoUrls) {
  const update = {};
  const set = {};
  const currentPhoto = getPhoto(agent);
  const currentVideos = getVideoUrls(agent);

  if (photoUrl && !currentPhoto) {
    const payload = photoPayload(photoUrl);
    set['personalInfo.photo'] = payload;
    set.photo = payload;
  }

  const missingVideos = videoUrls.filter((url) => !currentVideos.includes(url));
  if (missingVideos.length) {
    const experience = Array.isArray(agent.experience) ? [...agent.experience] : [];
    for (let i = 0; i < missingVideos.length; i++) {
      const url = missingVideos[i];
      const emptyIdx = experience.findIndex((e) => !e.videoUrl);
      if (emptyIdx >= 0) {
        experience[emptyIdx] = { ...experience[emptyIdx], videoUrl: url };
      } else {
        experience.push({
          title: `Expérience restaurée ${experience.length + 1}`,
          title_i18n: { fr: `Expérience restaurée ${experience.length + 1}`, en: `Restored experience ${experience.length + 1}` },
          videoUrl: url,
          description: 'Profil restauré automatiquement depuis Cloudinary.',
        });
      }
    }
    set.experience = experience;
  }

  if (Object.keys(set).length) {
    update.$set = set;
    if (missingVideos.length || (photoUrl && !currentPhoto)) {
      update.$set.lastUpdated = new Date();
    }
  }

  return update;
}

async function main() {
  configureCloudinary();
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  let manualMapping = {};
  if (fs.existsSync(mappingPath)) {
    manualMapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
    console.log(`Loaded mapping: ${mappingPath}`);
  }

  const [photos, videos, trashPhotos, trashVideos] = await Promise.all([
    listResources('rep-profile-photos/', 'image'),
    listResources('experience-videos/', 'video'),
    listTrash('rep-profile-photos/', 'image').catch(() => []),
    listTrash('experience-videos/', 'video').catch(() => []),
  ]);

  const assignedUrls = new Set();
  const agents = await db.collection('agents').find({}).toArray();
  for (const agent of agents) {
    for (const url of extractCloudinary(agent)) assignedUrls.add(url);
  }

  const unassignedPhotos = photos.filter((r) => !assignedUrls.has(r.secure_url));
  const unassignedVideos = videos.filter((r) => !assignedUrls.has(r.secure_url));

  console.log(`Agents: ${agents.length}`);
  console.log(`Cloudinary: ${photos.length} photos, ${videos.length} videos`);
  console.log(`Unassigned: ${unassignedPhotos.length} photos, ${unassignedVideos.length} videos`);
  console.log(`Trash: ${trashPhotos.length} photos, ${trashVideos.length} videos`);
  console.log(DRY_RUN ? '\n[DRY RUN]\n' : '\n[APPLY]\n');

  const agentIds = new Set(agents.map((a) => String(a._id)));
  const wallets = await db.collection('agentwallets').find({}).toArray();

  const summary = [];
  const usedUrls = new Set(assignedUrls);

  for (const agent of agents) {
    const email = agent.personalInfo?.email || '?';
    const userId = agent.userId ? String(agent.userId) : '';
    const agentId = String(agent._id);

    const needles = new Set([email, userId, agentId]);
    for (const w of wallets) {
      const aid = String(w.agentId);
      if (agentIds.has(aid)) continue;
      if (userId && (aid.startsWith(userId.slice(0, 8)) || aid === userId)) {
        needles.add(aid);
      }
    }

    const recovery = {
      photoUrl: null,
      videoUrls: [],
      sources: [],
    };

    // Manual mapping overrides
    const mapped = manualMapping[email] || manualMapping[agentId];
    if (mapped?.photoUrl) {
      recovery.photoUrl = mapped.photoUrl;
      recovery.sources.push('mapping:photo');
    }
    if (mapped?.videoUrls?.length) {
      recovery.videoUrls.push(...mapped.videoUrls);
      recovery.sources.push('mapping:videos');
    }

    // Mongo orphan scan
    const mongoUrls = await scanMongoForUrls(db, [...needles]);
    for (const url of mongoUrls) {
      if (url.includes('/image/')) recovery.photoUrl = recovery.photoUrl || url;
      if (url.includes('/video/')) recovery.videoUrls.push(url);
      recovery.sources.push('mongodb');
    }

    // Heuristic only when no mapping provided for this agent
    if (!mapped && (!getPhoto(agent) || !getVideoUrls(agent).length)) {
      const refDates = getReferenceDates(userId, wallets, agentIds);
      if (!recovery.photoUrl && refDates.length) {
        const photo = pickUnassignedPhoto(unassignedPhotos, refDates, usedUrls);
        if (photo) {
          recovery.photoUrl = photo.secure_url;
          recovery.sources.push('heuristic:photo');
        }
      }
      if (!getVideoUrls(agent).length && refDates.length) {
        const vids = pickUnassignedVideos(unassignedVideos, refDates, usedUrls);
        if (vids.length) {
          recovery.videoUrls.push(...vids);
          recovery.sources.push('heuristic:videos');
        }
      }
    }

    recovery.videoUrls = [...new Set(recovery.videoUrls)];

    if (recovery.photoUrl) usedUrls.add(recovery.photoUrl);
    for (const url of recovery.videoUrls) usedUrls.add(url);

    // Restore missing rep user for admin access
    if (APPLY && agent.userId) {
      const missingUser = await db.collection('users').findOne({ _id: agent.userId });
      if (!missingUser) {
        const userDoc = await ensureRepUser(db, agent);
        if (userDoc) {
          await db.collection('users').insertOne(userDoc);
          console.log(`${email}: restored missing user ${agent.userId}`);
        }
      }
    }

    // Verify existing media
    const existingPhoto = getPhoto(agent);
    if (existingPhoto) {
      const status = await checkUrl(existingPhoto);
      console.log(`${email}: existing photo [${status}]`);
      if (status === 404 && trashPhotos.some((t) => t.secure_url === existingPhoto || t.public_id === publicIdFromUrl(existingPhoto))) {
        const pid = publicIdFromUrl(existingPhoto);
        if (pid && APPLY) {
          await restoreTrash(pid, 'image');
          console.log(`  restored photo from trash: ${pid}`);
        }
      }
    }

    for (const url of getVideoUrls(agent)) {
      const status = await checkUrl(url);
      console.log(`${email}: existing video [${status}] ${url.slice(-40)}`);
    }

    const update = buildUpdate(agent, recovery.photoUrl, recovery.videoUrls);
    const hasWork = Boolean(update.$set);

    console.log(
      `${email}: photo=${getPhoto(agent) ? 'ok' : recovery.photoUrl ? 'will set' : 'missing'} | videos=${getVideoUrls(agent).length}${recovery.videoUrls.length ? ` +${recovery.videoUrls.length}` : ''} | sources=${recovery.sources.join(',') || '-'}`
    );

    if (hasWork && APPLY) {
      await db.collection('agents').updateOne({ _id: agent._id }, update);
      console.log(`  -> patched agent ${agentId}`);
    } else if (hasWork) {
      console.log(`  -> would patch:`, JSON.stringify(update.$set, null, 2).slice(0, 500));
    }

    summary.push({
      email,
      agentId,
      hadPhoto: Boolean(getPhoto(agent)),
      hadVideos: getVideoUrls(agent).length,
      recovery,
      patched: hasWork && APPLY,
    });
  }

  const out = path.join(__dirname, 'recover-all-agent-media-report.json');
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), summary }, null, 2));
  console.log(`\nReport: ${out}`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
