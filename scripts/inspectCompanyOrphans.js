import mongoose from 'mongoose';

const URI =
  'mongodb://mongo:DiGaBWUZXCkIxlZMuntztBaFJcOlUJIg@maglev.proxy.rlwy.net:40270/harx?authSource=admin';

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  const existingIds = new Set(
    (await db.collection('users').find({}).project({ _id: 1 }).toArray()).map((u) => String(u._id))
  );

  const subs = await db
    .collection('subscriptions')
    .find({ userId: { $exists: true } })
    .project({ userId: 1, companyId: 1 })
    .toArray();

  const missingSubs = subs.filter((s) => !existingIds.has(String(s.userId)));
  console.log('subscriptions with missing user:', missingSubs.length);

  for (const sub of missingSubs.slice(0, 15)) {
    const company = await db.collection('companies').findOne({ _id: sub.companyId });
    console.log({
      userId: String(sub.userId),
      companyId: String(sub.companyId),
      companyName: company?.name,
      companyUserId: company?.userId ? String(company.userId) : null,
      contactEmail: company?.contact?.email,
    });
  }

  await mongoose.disconnect();
}

main().catch(console.error);
