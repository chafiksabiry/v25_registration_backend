#!/usr/bin/env node
/**
 * Bootstrap the platform admin account.
 *
 * Usage:
 *   MONGODB_URI="mongodb://..." node scripts/seedAdminUser.js
 *
 * Optional env overrides:
 *   ADMIN_FULL_NAME, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_PHONE
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../src/models/User.js';

dotenv.config();

const ADMIN = {
  fullName: process.env.ADMIN_FULL_NAME || 'Chafik Sabiry',
  email: (process.env.ADMIN_EMAIL || 'chafiksabiryadmin@yopmail.com').toLowerCase().trim(),
  password: process.env.ADMIN_PASSWORD || 'P@str@mi@2026&',
  phone: process.env.ADMIN_PHONE || '+33600000000',
};

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is required');
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
