#!/usr/bin/env node
/**
 * Recover deleted/missing videos for a specific rep user.
 *
 * Usage:
 *   node scripts/recoverUserVideos.js --email mamour.kasse.sn@gmail.com --dry-run
 *   node scripts/recoverUserVideos.js --email mamour.kasse.sn@gmail.com --apply
 *   node scripts/recoverUserVideos.js --email mamour.kasse.sn@gmail.com --from=2026-06-20 --to=2026-06-27 --apply
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
const DEBUG = process.argv.includes('--debug');
const mappingArg = process.argv.find((a) => a.startsWith('--mapping='));
const mappingPath = mappingArg
  ? mappingArg.split('=')[1]
  : path.join(__dirname, 'agent-media-mapping.json');
const fromArg = process.argv.find((a) => a.startsWith('--from='))?.split('=')[1];
const toArg = process.argv.find((a) => a.startsWith('--to='))?.split('=')[1];
const emailArg = process.argv.find((a) => a.includes('@'));
if (!emailArg) {
  console.error('Usage: node scripts/recoverUserVideos.js --email user@example.com [--apply]');
  process.exit(1);
}

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

function withinMs(a, b, ms) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= ms;
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
    'agents',
  ];

  for (const name of cols) {
    const exists = (await db.listCollections().toArray()).some((c) => c.name === name);
    if (!exists) continue;

    for (const needle of needles) {
      if (!needle || needle.length < 4) continue;
      const query = {
        $or: [
          { userId: needle },
          { agentId: needle },
          { repId: needle },
          { profileId: needle },
          { email: needle },
          { 'personalInfo.email': needle },
        ],
      };
      if (mongoose.isValidObjectId(needle)) {
        query.$or.push({ _id: new mongoose.Types.ObjectId(needle) });
      }

      const docs = await db.collection(name).find(query).limit(50).toArray().catch(() => []);
      for (const doc of docs) {
        for (const url of extractCloudinary(doc)) found.add(url);
      }
    }
  }

  return [...found];
}

function pickVideosByDate(videos, refDates, usedUrls, max = 8) {
  return videos
    .filter((r) => !usedUrls.has(r.secure_url))
    .filter((r) => refDates.some((dt) => withinMs(r.created_at, dt, 48 * 3600 * 1000)))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .slice(0, max);
}

function pickVideosInRange(videos, from, to, usedUrls, max = 8) {
  const start = new Date(from);
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);
  return videos
    .filter((r) => !usedUrls.has(r.secure_url))
    .filter((r) => {
      const created = new Date(r.created_at);
      return created >= start && created <= end;
    })
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .slice(0, max);
}

function getExistingVideoUrls(agent) {
  const urls = (agent.experience || []).map((e) => e.videoUrl).filter(Boolean);
  if (agent.personalInfo?.presentationVideo?.url) urls.push(agent.personalInfo.presentationVideo.url);
  return urls;
}

async function main() {
  configureCloudinary();
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const user = await db.collection('users').findOne({ email: emailArg });
  if (!user) throw new Error(`User not found: ${emailArg}`);

  const agent =
    (await db.collection('agents').findOne({ userId: user._id })) ||
    (await db.collection('agents').findOne({ 'personalInfo.email': emailArg }));

  if (!agent) throw new Error(`Agent not found for ${emailArg}`);

  const userId = String(user._id);
  const agentId = String(agent._id);
  const refDates = [user.createdAt, agent.createdAt || user.createdAt].filter(Boolean);
  if (agent.personalInfo?.presentationVideo?.recordedAt) {
    refDates.push(new Date(agent.personalInfo.presentationVideo.recordedAt));
  }

  console.log(`\n=== Recover videos: ${emailArg} ===`);
  console.log(`User: ${userId} | Agent: ${agentId}`);
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

  const assignedUrls = new Set();
  for (const a of await db.collection('agents').find({}).toArray()) {
    for (const url of extractCloudinary(a)) assignedUrls.add(url);
  }

  const [experienceVideos, presentationVideos, trashExperience, trashPresentation] = await Promise.all([
    listResources('experience-videos/', 'video'),
    listResources('rep-profile-videos/', 'video'),
    listTrash('experience-videos/', 'video').catch(() => []),
    listTrash('rep-profile-videos/', 'video').catch(() => []),
  ]);

  const mongoUrls = await scanMongoForUrls(db, [emailArg, userId, agentId]);

  // gigagents may hold a snapshot of the full profile before deletion
  const gigAgent = await db
    .collection('gigagents')
    .findOne({
      $or: [
        { userId: user._id },
        { userId },
        { agentId: agent._id },
        { agentId },
        { email: emailArg },
        { 'personalInfo.email': emailArg },
      ],
    })
    .catch(() => null);
  if (gigAgent) {
    for (const url of extractCloudinary(gigAgent)) mongoUrls.push(url);
    console.log(`Found gigagents snapshot: ${gigAgent._id}`);
  }

  let manualMapping = {};
  if (fs.existsSync(mappingPath)) {
    manualMapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
    console.log(`Loaded mapping: ${mappingPath}`);
  }
  const mapped = manualMapping[emailArg] || manualMapping[agentId] || manualMapping[userId] || {};

  const mongoExperience = mongoUrls.filter((u) => u.includes('/video/') && u.includes('experience-videos'));
  const mongoPresentation = mongoUrls.filter((u) => u.includes('/video/') && u.includes('rep-profile-videos'));
  if (mapped.videoUrls?.length) mongoExperience.push(...mapped.videoUrls);
  if (mapped.presentationVideoUrl) mongoPresentation.push(mapped.presentationVideoUrl);

  const jobs = await db
    .collection('language_video_jobs')
    .find({ profileId: { $in: [userId, agentId] } })
    .toArray()
    .catch(() => []);

  for (const job of jobs) {
    const jobUrls = [...extractCloudinary(job)];
    for (const url of jobUrls) {
      if (url.includes('experience-videos')) mongoExperience.push(url);
      if (url.includes('rep-profile-videos')) mongoPresentation.push(url);
    }
    if (job.result?.videoUrl) {
      const url = job.result.videoUrl;
      if (url.includes('experience-videos')) mongoExperience.push(url);
      if (url.includes('rep-profile-videos')) mongoPresentation.push(url);
    }
  }

  const unassignedExperience = experienceVideos.filter((r) => !assignedUrls.has(r.secure_url));
  const unassignedPresentation = presentationVideos.filter((r) => !assignedUrls.has(r.secure_url));

  const recordedAt = agent.personalInfo?.presentationVideo?.recordedAt
    ? new Date(agent.personalInfo.presentationVideo.recordedAt)
    : null;
  if (recordedAt) refDates.push(recordedAt);

  const heuristicExperience = pickVideosByDate(unassignedExperience, refDates, assignedUrls, 4);
  let heuristicPresentation = pickVideosByDate(unassignedPresentation, refDates, assignedUrls, 1);

  // Explicit date-range scan (e.g. --from=2026-06-20 --to=2026-06-27)
  let rangeExperience = [];
  let rangePresentation = [];
  if (fromArg && toArg) {
    const existing = new Set([...assignedUrls, ...getExistingVideoUrls(agent)]);
    const missingExpCount = (agent.experience || []).filter((e) => !e.videoUrl).length;
    const needPresentation = !agent.personalInfo?.presentationVideo?.url;
    rangeExperience = pickVideosInRange(
      unassignedExperience,
      fromArg,
      toArg,
      existing,
      Math.max(missingExpCount, 4)
    );
    if (needPresentation) {
      rangePresentation = pickVideosInRange(unassignedPresentation, fromArg, toArg, existing, 1);
    }
    console.log(`\nDate range ${fromArg} → ${toArg}:`);
    console.log(`  unassigned experience videos: ${rangeExperience.length}`);
    rangeExperience.forEach((r) => console.log(`    ${r.created_at} | ${r.secure_url}`));
    console.log(`  unassigned presentation videos: ${rangePresentation.length}`);
    rangePresentation.forEach((r) => console.log(`    ${r.created_at} | ${r.secure_url}`));
  }

  // Tighter match around presentation recording time (±3h)
  if (!heuristicPresentation.length && recordedAt) {
    heuristicPresentation = unassignedPresentation
      .filter((r) => withinMs(r.created_at, recordedAt, 3 * 3600 * 1000))
      .sort(
        (a, b) =>
          Math.abs(new Date(a.created_at) - recordedAt) - Math.abs(new Date(b.created_at) - recordedAt)
      )
      .slice(0, 1);
  }

  // Filename timestamp match (exp-<ms> / profile videos uploaded same session as photo)
  const photoUrl = agent.personalInfo?.photo?.url || agent.photo?.url;
  const photoVersionMatch = photoUrl?.match(/\/v(\d+)\//);
  if (photoVersionMatch) {
    const photoTs = Number(photoVersionMatch[1]);
    const byVersion = unassignedPresentation.filter((r) => {
      const m = r.secure_url.match(/\/v(\d+)\//);
      return m && Math.abs(Number(m[1]) - photoTs) < 600;
    });
    if (byVersion.length && !heuristicPresentation.length) {
      heuristicPresentation = byVersion.slice(0, 1);
    }
  }

  const recoveredExperience = [
    ...new Set([
      ...mongoExperience,
      ...heuristicExperience.map((r) => r.secure_url),
      ...rangeExperience.map((r) => r.secure_url),
    ]),
  ];
  const recoveredPresentation =
    mongoPresentation[0] ||
    heuristicPresentation[0]?.secure_url ||
    rangePresentation[0]?.secure_url ||
    null;

  console.log('Current state:');
  console.log(`  Photo: ${agent.personalInfo?.photo?.url || agent.photo?.url || 'missing'}`);
  console.log(
    `  Presentation video: ${agent.personalInfo?.presentationVideo?.url || 'missing'} (recordedAt: ${agent.personalInfo?.presentationVideo?.recordedAt || '-'})`
  );
  (agent.experience || []).forEach((exp, i) => {
    console.log(`  Experience ${i + 1} (${exp.title} @ ${exp.company}): ${exp.videoUrl || 'missing'}`);
  });

  console.log('\nCloudinary trash:');
  console.log(`  experience-videos: ${trashExperience.length}`);
  trashExperience.forEach((r) => console.log(`    ${r.public_id} (${r.deleted_at})`));
  console.log(`  rep-profile-videos: ${trashPresentation.length}`);
  trashPresentation.forEach((r) => console.log(`    ${r.public_id} (${r.deleted_at})`));

  if (DEBUG) {
    const dayStart = new Date('2026-06-27T00:00:00.000Z');
    const dayEnd = new Date('2026-06-28T00:00:00.000Z');
    console.log('\n[DEBUG] All Cloudinary videos on 2026-06-27:');
    for (const r of [...presentationVideos, ...experienceVideos]) {
      const created = new Date(r.created_at);
      if (created >= dayStart && created < dayEnd) {
        const owner = assignedUrls.has(r.secure_url) ? 'assigned' : 'unassigned';
        console.log(`  [${owner}] ${r.created_at} | ${r.public_id}`);
      }
    }

    console.log('\n[DEBUG] Agents with same email or userId:');
    const dupes = await db
      .collection('agents')
      .find({ $or: [{ userId: user._id }, { 'personalInfo.email': emailArg }] })
      .toArray();
    dupes.forEach((a) => {
      console.log(`  agent ${a._id}`);
      console.log(`    presentation: ${a.personalInfo?.presentationVideo?.url || '-'}`);
      (a.experience || []).forEach((e, i) => console.log(`    exp${i + 1}: ${e.videoUrl || '-'}`));
    });
  }

  console.log('\nLanguage video jobs:', jobs.length);
  jobs.forEach((j) => console.log(`  ${j.status} | ${j.videoPath || j.result?.videoUrl || '-'}`));

  console.log('\nUnassigned Cloudinary (same day window):');
  console.log(`  presentation: ${unassignedPresentation.length} total, ${heuristicPresentation.length} matched`);
  heuristicPresentation.forEach((r) => console.log(`    ${r.created_at} | ${r.secure_url}`));
  console.log(`  experience: ${unassignedExperience.length} total, ${heuristicExperience.length} matched`);
  heuristicExperience.forEach((r) => console.log(`    ${r.created_at} | ${r.secure_url}`));

  console.log('\nCandidates to restore:');
  console.log(`  Presentation: ${recoveredPresentation || 'none'}`);
  recoveredExperience.forEach((url) => console.log(`  Experience: ${url}`));

  const update = { $set: { lastUpdated: new Date() } };

  if (recoveredPresentation && !agent.personalInfo?.presentationVideo?.url) {
    update.$set['personalInfo.presentationVideo'] = {
      url: recoveredPresentation,
      publicId: publicIdFromUrl(recoveredPresentation),
      recordedAt: agent.personalInfo?.presentationVideo?.recordedAt || new Date(),
    };
  }

  const experience = Array.isArray(agent.experience) ? agent.experience.map((e) => ({ ...e })) : [];
  const pendingVideos = recoveredExperience.filter(
    (url) => !getExistingVideoUrls(agent).includes(url)
  );
  let videoIdx = 0;
  for (let i = 0; i < experience.length && videoIdx < pendingVideos.length; i++) {
    if (!experience[i].videoUrl) {
      experience[i].videoUrl = pendingVideos[videoIdx++];
    }
  }
  while (videoIdx < pendingVideos.length) {
    experience.push({
      title: `Expérience restaurée ${experience.length + 1}`,
      title_i18n: {
        fr: `Expérience restaurée ${experience.length + 1}`,
        en: `Restored experience ${experience.length + 1}`,
      },
      videoUrl: pendingVideos[videoIdx++],
      description: 'Profil restauré automatiquement depuis Cloudinary.',
    });
  }
  const hasNewExperience = pendingVideos.length > 0;
  if (hasNewExperience) update.$set.experience = experience;

  const trashToRestore = [];
  for (const url of [recoveredPresentation, ...pendingVideos].filter(Boolean)) {
    const pid = publicIdFromUrl(url);
    const inTrash = [...trashExperience, ...trashPresentation].find((t) => t.public_id === pid);
    if (inTrash) trashToRestore.push({ publicId: pid, resourceType: url.includes('rep-profile-videos') ? 'video' : 'video' });
  }

  if (Object.keys(update.$set).length <= 1 && !trashToRestore.length) {
    console.log('\nNothing to recover.');
    await mongoose.disconnect();
    return;
  }

  if (trashToRestore.length) {
    console.log('\nRestoring from Cloudinary trash:');
    for (const { publicId } of trashToRestore) {
      console.log(`  ${publicId}`);
      if (APPLY) await restoreTrash(publicId, 'video');
    }
  }

  if (Object.keys(update.$set).length > 1) {
    console.log('\nMongoDB patch:');
    console.log(JSON.stringify(update.$set, null, 2));
    if (APPLY) {
      await db.collection('agents').updateOne({ _id: agent._id }, update);
      console.log('Agent updated.');
    } else {
      console.log('Dry run — use --apply to write changes.');
    }
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
