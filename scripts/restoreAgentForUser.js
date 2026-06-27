#!/usr/bin/env node
/**
 * Recreate a missing agent profile from the users collection.
 *
 * Usage:
 *   node scripts/restoreAgentForUser.js --userId=6a3d78b5fdf970b023cd2390 --dry-run
 *   node scripts/restoreAgentForUser.js --userId=6a3d78b5fdf970b023cd2390 --apply
 */
import mongoose from 'mongoose';

const DEFAULT_URI =
  'mongodb://mongo:DiGaBWUZXCkIxlZMuntztBaFJcOlUJIg@maglev.proxy.rlwy.net:40270/harx?authSource=admin';

const args = Object.fromEntries(
  process.argv.slice(2).map((part) => {
    const [k, v] = part.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const USER_ID = args.userId;
const APPLY = args.apply === true || args.apply === 'true';
const DRY_RUN = !APPLY;

function defaultOnboardingProgress(isVerified) {
  const now = new Date();
  return {
    phases: {
      phase1: {
        requiredActions: {
          accountCreated: true,
          emailVerified: Boolean(isVerified),
        },
        optionalActions: {
          locationConfirmed: false,
          identityVerified: false,
          twoFactorEnabled: false,
        },
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
        optionalActions: {
          photoUploaded: false,
          bioCompleted: false,
        },
        status: 'not_started',
      },
      phase3: {
        requiredActions: {
          languageAssessmentDone: false,
          contactCenterAssessmentDone: false,
        },
        optionalActions: {
          technicalEvaluationDone: false,
          bestPracticesReviewed: false,
        },
        status: 'not_started',
      },
      phase4: {
        requiredActions: {
          subscriptionActivated: false,
        },
        status: 'not_started',
      },
      phase5: {
        requiredActions: {
          gigApplied: false,
        },
        status: 'not_started',
      },
    },
    currentPhase: isVerified ? 2 : 1,
    lastUpdated: now,
  };
}

async function guessCountryId(db, phone = '') {
  const dial = phone.startsWith('+221') ? 'SN' : phone.startsWith('+212') ? 'MA' : null;
  if (!dial) return null;
  const tz = await db.collection('timezones').findOne({
    $or: [{ countryCode: dial }, { iso3166: dial }, { name: /senegal|morocco|maroc/i }],
  });
  return tz?._id || null;
}

async function main() {
  if (!USER_ID || !mongoose.isValidObjectId(USER_ID)) {
    console.error('Usage: node scripts/restoreAgentForUser.js --userId=<mongoId> [--apply]');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI || DEFAULT_URI;
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const userObjectId = new mongoose.Types.ObjectId(USER_ID);

  const user = await db.collection('users').findOne({ _id: userObjectId });
  if (!user) {
    console.error(`User not found: ${USER_ID}`);
    process.exit(1);
  }

  const existingAgent = await db.collection('agents').findOne({ userId: userObjectId });
  if (existingAgent) {
    console.log(`Agent already exists: ${existingAgent._id}`);
    await mongoose.disconnect();
    return;
  }

  const countryId = await guessCountryId(db, user.phone || '');
  const now = new Date();
  const agentDoc = {
    _id: new mongoose.Types.ObjectId(),
    userId: userObjectId,
    plan: null,
    stripeCustomerId: '',
    subscriptionStatus: '',
    status: 'draft',
    isBasicProfileCompleted: false,
    onboardingProgress: defaultOnboardingProgress(user.isVerified),
    availability: {
      schedule: [],
      flexibility: [],
    },
    personalInfo: {
      name: user.fullName,
      email: user.email,
      phone: user.phone || '+0000000000',
      ...(countryId ? { country: countryId } : {}),
      languages: [],
    },
    professionalSummary: {
      industries: [],
      activities: [],
      notableCompanies: [],
      keyExpertise: [],
    },
    skills: {
      technical: [],
      professional: [],
      soft: [],
      contactCenter: [],
    },
    experience: [],
    favoriteGigs: [],
    achievements: [],
    gigs: [],
    lastUpdated: now,
    createdAt: now,
    updatedAt: now,
  };

  const wallet = await db.collection('agentwallets').findOne({
    $or: [{ agentId: userObjectId }, { agentId: USER_ID }],
  });

  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Recreate agent for ${user.fullName} (${user.email})`);
  console.log(`New agent _id: ${agentDoc._id}`);
  if (wallet) {
    console.log(`Wallet ${wallet._id}: agentId ${wallet.agentId} -> ${agentDoc._id}`);
  }

  if (DRY_RUN) {
    console.log('\nRun with --apply to insert agent and fix wallet link.');
    await mongoose.disconnect();
    return;
  }

  await db.collection('agents').insertOne(agentDoc);

  if (wallet) {
    await db.collection('agentwallets').updateOne(
      { _id: wallet._id },
      { $set: { agentId: agentDoc._id, updatedAt: new Date() } }
    );
  } else {
    await db.collection('agentwallets').insertOne({
      agentId: agentDoc._id,
      availableBalance: 0,
      pendingWithdrawals: 0,
      pendingCommissions: 0,
      lifetimeEarnings: 0,
      pendingRetraction: 0,
      pendingCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  console.log('Agent restored successfully.');
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
