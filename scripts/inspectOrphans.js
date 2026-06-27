import mongoose from 'mongoose';

const URI =
  'mongodb://mongo:DiGaBWUZXCkIxlZMuntztBaFJcOlUJIg@maglev.proxy.rlwy.net:40270/harx?authSource=admin';

async function sampleCollection(db, name, fields) {
  const col = db.collection(name);
  const count = await col.countDocuments();
  if (count === 0) return;
  const sample = await col.findOne({});
  console.log(`\n=== ${name} (${count}) ===`);
  console.log('sample keys:', Object.keys(sample || {}));
  if (fields) {
    const docs = await col.find({}).limit(5).project(fields).toArray();
    docs.forEach((d) => console.log(JSON.stringify(d)));
  }
}

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  const usersCol = db.collection('users');
  const userIds = new Set(
    (await usersCol.find({}).project({ _id: 1, email: 1 }).toArray()).map((u) => String(u._id))
  );

  await sampleCollection(db, 'companies', {
    userId: 1,
    name: 1,
    email: 1,
    'contact.email': 1,
    createdAt: 1,
  });
  await sampleCollection(db, 'clients', { userId: 1, email: 1, name: 1 });
  await sampleCollection(db, 'reps', { userId: 1, email: 1, name: 1 });
  await sampleCollection(db, 'profiles', { userId: 1, email: 1 });

  const agents = await db
    .collection('agents')
    .find({})
    .project({
      userId: 1,
      'personalInfo.name': 1,
      'personalInfo.email': 1,
      'personalInfo.phone': 1,
      status: 1,
      createdAt: 1,
    })
    .toArray();

  const orphaned = agents.filter((a) => a.userId && !userIds.has(String(a.userId)));
  console.log('\n=== Unique orphaned userIds from agents ===');
  const byUserId = new Map();
  for (const a of orphaned) {
    const uid = String(a.userId);
    if (!byUserId.has(uid)) {
      byUserId.set(uid, {
        userId: uid,
        fullName: a.personalInfo?.name || 'Unknown',
        email: a.personalInfo?.email || null,
        phone: a.personalInfo?.phone || '+0000000000',
        typeUser: 'rep',
        agentCount: 1,
      });
    } else {
      byUserId.get(uid).agentCount += 1;
    }
  }
  console.log('unique missing users:', byUserId.size);
  [...byUserId.values()].slice(0, 30).forEach((u) =>
    console.log(`${u.userId} | ${u.fullName} | ${u.email} | agents:${u.agentCount}`)
  );

  const companies = await db
    .collection('companies')
    .find({})
    .project({ userId: 1, name: 1, email: 1, createdAt: 1 })
    .toArray()
    .catch(() => []);

  const orphanedCompanies = (companies || []).filter(
    (c) => c.userId && !userIds.has(String(c.userId))
  );
  console.log('\n=== Orphan companies (missing user) ===', orphanedCompanies.length);

  await mongoose.disconnect();
}

main().catch(console.error);
