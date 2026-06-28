#!/usr/bin/env node
/**
 * Remove all experience + presentation videos from Mamour's agent.
 *
 * Usage:
 *   node scripts/clearMamourVideos.js --apply
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../v25_dash_rep_back/.env') });
dotenv.config();

const APPLY = process.argv.includes('--apply');
const USER_ID = '6a3d78b5fdf970b023cd2390';
const AGENT_ID = '6a403288ced08f5ef23a5b94';

const VIDEO_FIELDS = [
  'videoUrl',
  'videoDuration',
  'videoTranscription',
  'videoAnalysis',
  'videoLanguageAssessment',
  'videoFraudCheck',
  'videoRelevance',
  'videoAnalyzedAt',
];

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const agent = await db.collection('agents').findOne({
  _id: new mongoose.Types.ObjectId(AGENT_ID),
  userId: new mongoose.Types.ObjectId(USER_ID),
});

if (!agent) throw new Error(`Agent ${AGENT_ID} not found for user ${USER_ID}`);

const experience = (agent.experience || []).map((exp) => {
  const next = { ...exp };
  for (const field of VIDEO_FIELDS) delete next[field];
  return next;
});

console.log('Agent:', AGENT_ID, agent.personalInfo?.email);
(agent.experience || []).forEach((e, i) => {
  if (e.videoUrl) console.log(`  REMOVE exp ${i + 1}: ${e.title} → ${e.videoUrl.slice(-45)}`);
});
if (agent.personalInfo?.presentationVideo) {
  console.log('  REMOVE presentationVideo');
}

const update = {
  $set: {
    experience,
    lastUpdated: new Date(),
    'onboardingProgress.phases.phase2.requiredActions.experienceVideosAdded': false,
  },
  $unset: {
    'personalInfo.presentationVideo': '',
  },
};

console.log(APPLY ? '\nApplying...' : '\nDry run — use --apply to write');
if (APPLY) {
  await db.collection('agents').updateOne({ _id: agent._id }, update);
  console.log('All videos removed.');
}

await mongoose.disconnect();
