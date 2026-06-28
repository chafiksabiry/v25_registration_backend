#!/usr/bin/env node
/**
 * Fix Mamour agent: remove wrongly assigned orphan videos, keep only confirmed uploads.
 *
 * Usage:
 *   node scripts/fixMamourAgentVideos.js --dry-run
 *   node scripts/fixMamourAgentVideos.js --apply
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../v25_dash_rep_back/.env') });
dotenv.config();

const APPLY = process.argv.includes('--apply');
const EMAIL = 'mamour.kasse.sn@gmail.com';
const AGENT_ID = '6a403288ced08f5ef23a5b94';

// Only Mamour's own uploads (25/06 session) — NOT orphan videos from other users.
const CONFIRMED_VIDEO_URLS = new Set([
  'https://res.cloudinary.com/dyqg8x26j/video/upload/v1782370961/experience-videos/exp-1782370960951.webm',
  'https://res.cloudinary.com/dyqg8x26j/video/upload/v1782372389/experience-videos/exp-1782372388846.webm',
]);

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const agent = await db.collection('agents').findOne({
  _id: new mongoose.Types.ObjectId(AGENT_ID),
  'personalInfo.email': EMAIL,
});

if (!agent) throw new Error('Mamour agent not found');

const experience = (agent.experience || []).map((exp) => {
  const next = { ...exp };
  if (next.videoUrl && !CONFIRMED_VIDEO_URLS.has(next.videoUrl)) {
    console.log(`REMOVE wrong video from "${next.title} @ ${next.company}":`);
    console.log(`  ${next.videoUrl}`);
    delete next.videoUrl;
    delete next.videoDuration;
    delete next.videoTranscription;
    delete next.videoAnalysis;
    delete next.videoLanguageAssessment;
    delete next.videoFraudCheck;
    delete next.videoRelevance;
    delete next.videoAnalyzedAt;
  } else if (next.videoUrl) {
    console.log(`KEEP "${next.title} @ ${next.company}": ${next.videoUrl.slice(-40)}`);
  } else {
    console.log(`EMPTY "${next.title} @ ${next.company}"`);
  }
  return next;
});

const update = {
  $set: {
    experience,
    lastUpdated: new Date(),
    'onboardingProgress.phases.phase2.requiredActions.experienceVideosAdded': experience.some(
      (e) => e.videoUrl
    ),
  },
};

// presentationVideo without url causes UI to think a video exists
if (agent.personalInfo?.presentationVideo?.url) {
  console.log('KEEP presentationVideo url');
} else if (agent.personalInfo?.presentationVideo) {
  console.log('CLEAR presentationVideo stub (recordedAt only, no real url)');
  update.$unset = { 'personalInfo.presentationVideo': '' };
}

console.log(`\nMode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
if (APPLY) {
  await db.collection('agents').updateOne({ _id: agent._id }, update);
  console.log('Agent fixed.');
} else {
  console.log(JSON.stringify(update, null, 2));
}

await mongoose.disconnect();
