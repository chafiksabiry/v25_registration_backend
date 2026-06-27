#!/usr/bin/env node
/**
 * Set the same password for all company users.
 *
 * Usage:
 *   node scripts/setCompanyPasswords.js --dry-run
 *   node scripts/setCompanyPasswords.js --apply
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';

dotenv.config();

const APPLY = process.argv.includes('--apply');
const PASSWORD = process.env.COMPANY_PASSWORD || 'P@str@mi@2026&';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is required');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const companies = await User.find({ typeUser: 'company' })
    .select('email fullName typeUser')
    .lean();

  console.log(`Found ${companies.length} company user(s):`);
  for (const user of companies) {
    console.log(`  - ${user.fullName} <${user.email}>`);
  }

  if (!companies.length) {
    await mongoose.disconnect();
    return;
  }

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to update passwords.');
    await mongoose.disconnect();
    return;
  }

  const hashedPassword = await bcrypt.hash(PASSWORD, 10);
  const result = await User.updateMany(
    { typeUser: 'company' },
    { $set: { password: hashedPassword } },
  );

  console.log(`\nUpdated ${result.modifiedCount} company password(s).`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
