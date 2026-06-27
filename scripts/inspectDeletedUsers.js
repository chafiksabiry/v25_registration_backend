import mongoose from 'mongoose';

const URI =
  process.argv[2] ||
  'mongodb://mongo:DiGaBWUZXCkIxlZMuntztBaFJcOlUJIg@maglev.proxy.rlwy.net:40270/harx?authSource=admin';

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;

  console.log('=== Collections ===');
  const collections = (await db.listCollections().toArray()).map((c) => c.name).sort();
  console.log(collections.join('\n'));

  const usersCol = db.collection('users');
  const userCount = await usersCol.countDocuments();
  console.log('\n=== users collection ===');
  console.log('count:', userCount);

  const recent = await usersCol
    .find({})
    .sort({ createdAt: -1 })
    .limit(10)
    .project({ fullName: 1, email: 1, typeUser: 1, createdAt: 1 })
    .toArray();
  console.log('\nRecent users:');
  recent.forEach((u) =>
    console.log(`- ${u._id} | ${u.fullName} | ${u.email} | ${u.typeUser || '-'} | ${u.createdAt}`)
  );

  // Orphan agents (profile exists but user missing)
  const agentsCol = db.collection('agents');
  const agentCount = await agentsCol.countDocuments();
  console.log('\n=== agents collection ===');
  console.log('count:', agentCount);

  const agents = await agentsCol
    .find({})
    .project({ userId: 1, 'personalInfo.email': 1, 'personalInfo.name': 1, status: 1, createdAt: 1 })
    .limit(500)
    .toArray();

  const userIds = new Set(
    (await usersCol.find({}).project({ _id: 1 }).toArray()).map((u) => String(u._id))
  );

  const orphanedAgents = agents.filter((a) => a.userId && !userIds.has(String(a.userId)));
  console.log('orphaned agents (userId not in users):', orphanedAgents.length);
  orphanedAgents.slice(0, 20).forEach((a) => {
    console.log(
      `  agent ${a._id} | userId ${a.userId} | ${a.personalInfo?.name || '?'} | ${a.personalInfo?.email || '?'}`
    );
  });

  // Backup / deleted collections
  const backupLike = collections.filter(
    (n) => /user|backup|deleted|archive|trash|restore/i.test(n) && n !== 'users'
  );
  console.log('\n=== Possible backup collections ===');
  for (const name of backupLike) {
    const count = await db.collection(name).countDocuments();
    console.log(`${name}: ${count}`);
  }

  // Oplog check
  try {
    const oplog = db.admin().command({ replSetGetStatus: 1 });
    console.log('\n=== Replica set (oplog possible) ===');
    console.log(JSON.stringify(await oplog, null, 2).slice(0, 500));
  } catch (e) {
    console.log('\n=== Oplog / replica set ===');
    console.log('Not available:', e.message);
  }

  try {
    const localDb = mongoose.connection.client.db('local');
    const oplogCount = await localDb.collection('oplog.rs').countDocuments();
    console.log('oplog.rs entries:', oplogCount);
  } catch (e) {
    console.log('local.oplog.rs:', e.message);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
