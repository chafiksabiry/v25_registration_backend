import mongoose from 'mongoose';

const URI =
  process.env.MONGODB_URI ||
  'mongodb://mongo:DiGaBWUZXCkIxlZMuntztBaFJcOlUJIg@maglev.proxy.rlwy.net:40270/harx?authSource=admin';

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;

  const users = await db
    .collection('users')
    .find({})
    .project({ fullName: 1, email: 1, typeUser: 1, isVerified: 1, createdAt: 1 })
    .sort({ createdAt: -1 })
    .toArray();

  const agents = await db
    .collection('agents')
    .find({})
    .project({ userId: 1, status: 1, 'personalInfo.name': 1, 'personalInfo.email': 1, createdAt: 1 })
    .toArray();

  const userIds = new Set(users.map((u) => String(u._id)));

  const orphanedAgents = agents.filter((a) => a.userId && !userIds.has(String(a.userId)));
  const repUsers = users.filter((u) => u.typeUser === 'rep');
  const agentByUserId = new Map(agents.filter((a) => a.userId).map((a) => [String(a.userId), a]));

  const repsWithoutAgent = repUsers.filter((u) => !agentByUserId.has(String(u._id)));

  console.log('=== RÉSUMÉ ===');
  console.log('Users total:', users.length);
  console.log('Agents total:', agents.length);
  console.log('Agents orphelins (user supprimé, agent resté):', orphanedAgents.length);
  console.log('REPs sans agent:', repsWithoutAgent.length);

  if (orphanedAgents.length) {
    console.log('\n=== AGENTS ORPHELINS (user manquant) ===');
    orphanedAgents.forEach((a) => {
      console.log(
        `- agent ${a._id} | userId MANQUANT ${a.userId} | ${a.personalInfo?.name || '?'} | ${a.personalInfo?.email || '?'}`
      );
    });
  }

  if (repsWithoutAgent.length) {
    console.log('\n=== REPs SANS AGENT ===');
    repsWithoutAgent.forEach((u) => {
      console.log(`- user ${u._id} | ${u.fullName} | ${u.email}`);
    });
  }

  console.log('\n=== TOUS LES USERS ACTUELS ===');
  users.forEach((u) => {
    const agent = agentByUserId.get(String(u._id));
    console.log(
      `- ${u._id} | ${u.fullName} | ${u.email} | ${u.typeUser || '-'} | agent: ${agent ? agent._id : 'NON'}`
    );
  });

  console.log('\n=== AGENTS SANS USER (même liste que orphelins) ===');
  console.log('(voir ci-dessus si count > 0)');

  await mongoose.disconnect();
}

main().catch(console.error);
