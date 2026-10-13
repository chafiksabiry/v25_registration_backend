#!/usr/bin/env node
/**
 * Bootstrap the platform admin account.
 *
 * Usage:
 *   MONGODB_URI="mongodb://..." ADMIN_EMAIL="..." ADMIN_PASSWORD="..." node scripts/seedAdminUser.js
 *
 * Required env vars (no defaults — this script must never ship a
 * guessable, real-looking credential in source control):
 *   ADMIN_EMAIL, ADMIN_PASSWORD
 * Optional env overrides:
 *   ADMIN_FULL_NAME, ADMIN_PHONE
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../src/models/User.js';

dotenv.config();

const ADMIN = {
  fullName: process.env.ADMIN_FULL_NAME || 'HARX Admin',
  email: (process.env.ADMIN_EMAIL || '').toLowerCase().trim(),
  password: process.env.ADMIN_PASSWORD || '',
  phone: process.env.ADMIN_PHONE || '+33600000000',
};

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is required.');
    console.error('Create a .env file in this folder (see .env.example) or run:');
    console.error('  MONGODB_URI="mongodb://..." npm run seed:admin');
    process.exit(1);
  }
  if (!ADMIN.email || !ADMIN.password) {
    console.error('ADMIN_EMAIL and ADMIN_PASSWORD are required (no built-in default credential).');
    console.error('  ADMIN_EMAIL="..." ADMIN_PASSWORD="..." MONGODB_URI="mongodb://..." npm run seed:admin');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  let user = await User.findOne({ email: ADMIN.email });

  if (user) {
    user.fullName = ADMIN.fullName;
    user.phone = ADMIN.phone;
    user.password = ADMIN.password;
    user.typeUser = 'admin';
    user.isVerified = true;
    user.firstTime = false;
    user.verificationCode = undefined;
    await user.save();
    console.log(`Updated existing admin user: ${ADMIN.email} (${user._id})`);
  } else {
    user = await User.create({
      fullName: ADMIN.fullName,
      email: ADMIN.email,
      password: ADMIN.password,
      phone: ADMIN.phone,
      typeUser: 'admin',
      isVerified: true,
      firstTime: false,
    });
    console.log(`Created admin user: ${ADMIN.email} (${user._id})`);
  }

  await mongoose.disconnect();
  console.log('Done.');
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
