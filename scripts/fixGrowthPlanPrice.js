#!/usr/bin/env node
/**
 * Fix GROWTH plan price in subscriptionplans (was 1 EUR test value, should be 249).
 *   node scripts/fixGrowthPlanPrice.js --dry-run
 *   node scripts/fixGrowthPlanPrice.js --apply
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const APPLY = process.argv.includes('--apply');
const CORRECT_PRICE = 249;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const growth = await db.collection('subscriptionplans').findOne({ name: 'GROWTH' });
  if (!growth) {
    console.log('GROWTH plan not found');
    await mongoose.disconnect();
    return;
  }

  console.log(`Current GROWTH price: ${growth.price} ${growth.currency || 'eur'}`);
  console.log(`Target price: ${CORRECT_PRICE}`);

  if (growth.price === CORRECT_PRICE) {
    console.log('Already correct.');
  } else if (APPLY) {
    await db.collection('subscriptionplans').updateOne(
      { _id: growth._id },
      { $set: { price: CORRECT_PRICE, updatedAt: new Date() } },
    );
    console.log('[APPLY] Updated GROWTH price to', CORRECT_PRICE);
  } else {
    console.log('[DRY RUN] Would update GROWTH price to', CORRECT_PRICE);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
