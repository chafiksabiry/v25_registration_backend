import mongoose from 'mongoose';

const URI =
  'mongodb://mongo:DiGaBWUZXCkIxlZMuntztBaFJcOlUJIg@maglev.proxy.rlwy.net:40270/harx?authSource=admin';

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;

  const subs = await db.collection('subscriptions').find({ userId: { $exists: true } }).limit(5).toArray();
  console.log('subscriptions sample:', JSON.stringify(subs, null, 2));

  const gigs = await db.collection('gigs').find({ userId: { $exists: true } }).limit(3).toArray();
  console.log('\ngigs sample keys:', gigs[0] ? Object.keys(gigs[0]) : 'none');
  if (gigs[0]) console.log(JSON.stringify(gigs[0], null, 2).slice(0, 800));

  const leads = await db.collection('leads').find({ userId: { $exists: true } }).limit(2).toArray();
  console.log('\nleads sample:', JSON.stringify(leads, null, 2).slice(0, 600));

  await mongoose.disconnect();
}

main().catch(console.error);
