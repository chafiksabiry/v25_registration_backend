#!/usr/bin/env node
/**
 * Validate experience videos and rebuild skills from valid analyses only.
 * If a Cloudinary video is gone, clear its analysis and remove derived skills.
 *
 *   node scripts/syncAgentVideoSkills.js --dry-run
 *   node scripts/syncAgentVideoSkills.js --apply
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { rebuildProfileVideoInsights } = require('../../v25_dash_rep_back/src/services/VideoInsightsService.js');

dotenv.config();

const APPLY = process.argv.includes('--apply');

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

async function checkUrl(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const agents = await db.collection('agents').find({}).toArray();

  console.log(APPLY ? '[APPLY]' : '[DRY RUN]', `agents: ${agents.length}\n`);

  for (const agent of agents) {
    const email = agent.personalInfo?.email || String(agent._id);
    let changed = false;
    const experience = Array.isArray(agent.experience) ? [...agent.experience] : [];

    for (let i = 0; i < experience.length; i++) {
      const exp = { ...experience[i] };
      const hasUrl = Boolean(exp.videoUrl);
      const urlOk = hasUrl ? await checkUrl(exp.videoUrl) : true;

      if (hasUrl && !urlOk) {
        console.log(`${email}: experience #${i} video DELETED → clear analysis`);
        for (const field of VIDEO_FIELDS) delete exp[field];
        experience[i] = exp;
        changed = true;
      } else if (!hasUrl && exp.videoAnalysis) {
        console.log(`${email}: experience #${i} analysis without video → clear`);
        for (const field of VIDEO_FIELDS) delete exp[field];
        experience[i] = exp;
        changed = true;
      }
    }

    const workingAgent = { ...agent, experience };
    const insightSet = rebuildProfileVideoInsights(workingAgent);
    const hasInsightChanges = Object.keys(insightSet).length > 0;

    if (changed || hasInsightChanges) {
      const update = { $set: { experience, lastUpdated: new Date(), ...insightSet } };
      console.log(`${email}: rebuild skills from valid videos`);
      if (APPLY) {
        await db.collection('agents').updateOne({ _id: agent._id }, update);
      }
    } else {
      console.log(`${email}: OK`);
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
