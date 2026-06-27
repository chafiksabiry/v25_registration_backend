#!/usr/bin/env node
/**
 * Restore specific users from admin list + ensure agent/company dependencies.
 *
 * Usage:
 *   node scripts/restoreListedUsers.js --dry-run
 *   node scripts/restoreListedUsers.js --apply
 *
 * Passwords: edit RESTORE_USERS below or set per-user in scripts/restore-users.json
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_URI =
  process.env.MONGODB_URI ||
  'mongodb://mongo:DiGaBWUZXCkIxlZMuntztBaFJcOlUJIg@maglev.proxy.rlwy.net:40270/harx?authSource=admin';
const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

const DEFAULT_REP_PASSWORD = process.env.RESTORE_REP_PASSWORD || 'HarxRestore2026!';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'P@str@mi@2026&';

const RESTORE_USERS = [
  {
    fullName: 'Chafik Sabiry',
    email: 'chafiksabiryadmin@yopmail.com',
    phone: '+33600000000',
    typeUser: 'admin',
    isVerified: true,
    password: DEFAULT_ADMIN_PASSWORD,
  },
  {
    fullName: 'Kassé Mamour',
    email: 'mamour.kasse.sn@gmail.com',
    phone: '+221776612629',
    typeUser: 'rep',
    isVerified: true,
    userId: '6a3d78b5fdf970b023cd2390',
    password: DEFAULT_REP_PASSWORD,
  },
  {
    fullName: 'QARA',
    email: 'elhoucineqara250620261@yopmail.com',
    phone: '+212637446431',
    typeUser: 'rep',
    isVerified: false,
    password: DEFAULT_REP_PASSWORD,
  },
  {
    fullName: 'Nakbi Nabil',
    email: 'nakbinakbi@gmail.com',
    phone: '+212626966304',
    typeUser: 'rep',
    isVerified: true,
    userId: '6a3c087a51f15e390804a4ad',
    password: DEFAULT_REP_PASSWORD,
  },
  {
    fullName: 'QARA',
    email: 'elhoucineqarareps2306@yopmail.com',
    phone: '+212637446431',
    typeUser: 'rep',
    isVerified: false,
    password: DEFAULT_REP_PASSWORD,
  },
  {
    fullName: 'Tarik sabiry',
    email: 'riksabiry@gmail.com',
    phone: '+212614693529',
    typeUser: 'rep',
    isVerified: true,
    userId: '6a3af877846276a2eb123ac3',
    password: DEFAULT_REP_PASSWORD,
  },
  {
    fullName: 'Rali Sabiry',
    email: 'zdz89175@gmail.com',
    phone: '+33652411708',
    typeUser: 'rep',
    isVerified: true,
    password: DEFAULT_REP_PASSWORD,
  },
];

function normalizePhone(phone) {
  const raw = String(phone || '').replace(/\s/g, '');
  if (raw.startsWith('00')) return `+${raw.slice(2)}`;
  if (raw.startsWith('+')) return raw;
  if (raw.startsWith('0')) return `+33${raw.slice(1)}`;
  return raw;
}

function defaultOnboardingProgress(isVerified) {
  const now = new Date();
  return {
    phases: {
      phase1: {
        requiredActions: { accountCreated: true, emailVerified: Boolean(isVerified) },
        optionalActions: { locationConfirmed: false, identityVerified: false, twoFactorEnabled: false },
        status: isVerified ? 'completed' : 'in_progress',
        ...(isVerified ? { completedAt: now } : {}),
      },
      phase2: {
        requiredActions: {
          experienceAdded: false,
          skillsAdded: false,
          industriesAdded: false,
          activitiesAdded: false,
          availabilitySet: false,
          videoUploaded: false,
          experienceVideosAdded: false,
        },
        optionalActions: { photoUploaded: false, bioCompleted: false },
        status: 'not_started',
      },
      phase3: {
        requiredActions: { languageAssessmentDone: false, contactCenterAssessmentDone: false },
        optionalActions: { technicalEvaluationDone: false, bestPracticesReviewed: false },
        status: 'not_started',
      },
      phase4: { requiredActions: { subscriptionActivated: false }, status: 'not_started' },
      phase5: { requiredActions: { gigApplied: false }, status: 'not_started' },
    },
    currentPhase: isVerified ? 2 : 1,
    lastUpdated: now,
  };
}

async function guessCountryId(db, phone = '') {
  const dial = phone.startsWith('+221') ? 'SN' : phone.startsWith('+212') ? 'MA' : phone.startsWith('+33') ? 'FR' : null;
  if (!dial) return null;
  const tz = await db.collection('timezones').findOne({
    $or: [{ countryCode: dial }, { iso3166: dial }, { name: /senegal|morocco|maroc|france/i }],
  });
  return tz?._id || null;
}

async function resolveUserId(db, spec) {
  if (spec.userId && mongoose.isValidObjectId(spec.userId)) {
    return new mongoose.Types.ObjectId(spec.userId);
  }
  const existing = await db.collection('users').findOne({ email: spec.email.toLowerCase() });
  if (existing) return existing._id;

  const agent = await db.collection('agents').findOne({ 'personalInfo.email': spec.email.toLowerCase() });
  if (agent?.userId) return agent.userId;

  return new mongoose.Types.ObjectId();
}

async function upsertUser(db, spec, hashedPassword) {
  const email = spec.email.toLowerCase().trim();
  const userId = await resolveUserId(db, spec);
  const existing = await db.collection('users').findOne({ _id: userId });
  const doc = {
    fullName: spec.fullName,
    email,
    phone: normalizePhone(spec.phone),
    password: hashedPassword,
    typeUser: spec.typeUser,
    isVerified: Boolean(spec.isVerified),
    firstTime: false,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.collection('users').updateOne({ _id: userId }, { $set: doc });
    return { userId, action: 'updated' };
  }

  await db.collection('users').insertOne({
    _id: userId,
    ...doc,
    createdAt: new Date(),
  });
  return { userId, action: 'created' };
}

async function ensureAgent(db, spec, userId) {
  if (spec.typeUser !== 'rep') return { action: 'skipped' };

  let agent = await db.collection('agents').findOne({ userId });
  if (!agent) {
    agent = await db.collection('agents').findOne({ 'personalInfo.email': spec.email.toLowerCase() });
  }

  if (agent) {
    await db.collection('agents').updateOne(
      { _id: agent._id },
      {
        $set: {
          userId,
          'personalInfo.name': spec.fullName,
          'personalInfo.email': spec.email.toLowerCase(),
          'personalInfo.phone': normalizePhone(spec.phone),
          updatedAt: new Date(),
        },
      }
    );

    const wallet = await db.collection('agentwallets').findOne({
      $or: [{ agentId: agent._id }, { agentId: userId }, { agentId: String(userId) }],
    });
    if (wallet && String(wallet.agentId) !== String(agent._id)) {
      const duplicate = await db.collection('agentwallets').findOne({ agentId: agent._id, _id: { $ne: wallet._id } });
      if (duplicate) {
        await db.collection('agentwallets').deleteOne({ _id: wallet._id });
      } else {
        await db.collection('agentwallets').updateOne(
          { _id: wallet._id },
          { $set: { agentId: agent._id, updatedAt: new Date() } }
        );
      }
    } else if (!wallet) {
      await db.collection('agentwallets').insertOne({
        agentId: agent._id,
        availableBalance: 0,
        pendingWithdrawals: 0,
        pendingCommissions: 0,
        lifetimeEarnings: 0,
        pendingRetraction: 0,
        pendingCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    return { action: 'linked', agentId: agent._id };
  }

  const now = new Date();
  const countryId = await guessCountryId(db, normalizePhone(spec.phone));
  const agentId = new mongoose.Types.ObjectId();
  const agentDoc = {
    _id: agentId,
    userId,
    plan: null,
    stripeCustomerId: '',
    subscriptionStatus: '',
    status: 'draft',
    isBasicProfileCompleted: false,
    onboardingProgress: defaultOnboardingProgress(spec.isVerified),
    availability: { schedule: [], flexibility: [] },
    personalInfo: {
      name: spec.fullName,
      email: spec.email.toLowerCase(),
      phone: normalizePhone(spec.phone),
      ...(countryId ? { country: countryId } : {}),
      languages: [],
    },
    professionalSummary: { industries: [], activities: [], notableCompanies: [], keyExpertise: [] },
    skills: { technical: [], professional: [], soft: [], contactCenter: [] },
    experience: [],
    favoriteGigs: [],
    achievements: [],
    gigs: [],
    lastUpdated: now,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection('agents').insertOne(agentDoc);
  await db.collection('agentwallets').insertOne({
    agentId,
    availableBalance: 0,
    pendingWithdrawals: 0,
    pendingCommissions: 0,
    lifetimeEarnings: 0,
    pendingRetraction: 0,
    pendingCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  return { action: 'created', agentId };
}

async function main() {
  const jsonPath = path.join(__dirname, 'restore-users.json');
  const users = fs.existsSync(jsonPath)
    ? JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
    : RESTORE_USERS;

  await mongoose.connect(DEFAULT_URI);
  const db = mongoose.connection.db;

  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Restoring ${users.length} users...\n`);

  for (const spec of users) {
    const hashedPassword = await bcrypt.hash(spec.password, 10);
    if (DRY_RUN) {
      const userId = await resolveUserId(db, spec);
      const agent = await db.collection('agents').findOne({
        $or: [{ userId }, { 'personalInfo.email': spec.email.toLowerCase() }],
      });
      console.log(
        `${spec.email} | ${spec.typeUser} | userId=${userId} | agent=${agent?._id || 'create'} | pwd=***`
      );
      continue;
    }

    const { userId, action: userAction } = await upsertUser(db, spec, hashedPassword);
    const agentResult =
      spec.typeUser === 'rep' ? await ensureAgent(db, spec, userId) : { action: 'n/a' };

    console.log(
      `${spec.fullName} (${spec.email}) -> user ${userAction} ${userId}, agent ${agentResult.action}${agentResult.agentId ? ` ${agentResult.agentId}` : ''}`
    );
  }

  if (DRY_RUN) {
    console.log('\nRun with --apply to write changes.');
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
