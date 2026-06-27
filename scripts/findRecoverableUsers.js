import mongoose from 'mongoose';

const URI =
  'mongodb://mongo:DiGaBWUZXCkIxlZMuntztBaFJcOlUJIg@maglev.proxy.rlwy.net:40270/harx?authSource=admin';

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;

  const existingUsers = await db.collection('users').find({}).toArray();
  const existingIds = new Set(existingUsers.map((u) => String(u._id)));
  const existingEmails = new Set(existingUsers.map((u) => u.email?.toLowerCase()).filter(Boolean));

  const collections = (await db.listCollections().toArray()).map((c) => c.name);
  const candidates = new Map();

  for (const name of collections) {
    if (name === 'users') continue;
    const col = db.collection(name);
    let sample;
    try {
      sample = await col.findOne({});
    } catch {
      continue;
    }
    if (!sample) continue;

    const hasUserId = 'userId' in sample || sample.user?._id;
    if (!hasUserId && !JSON.stringify(sample).includes('userId')) continue;

    const docs = await col
      .find({ userId: { $exists: true, $ne: null } })
      .project({ userId: 1, email: 1, fullName: 1, name: 1, 'personalInfo.email': 1, 'personalInfo.name': 1, 'personalInfo.phone': 1, 'contact.email': 1, typeUser: 1, createdAt: 1 })
      .limit(2000)
      .toArray();

    for (const doc of docs) {
      const uid = String(doc.userId);
      if (existingIds.has(uid)) continue;
      if (!candidates.has(uid)) {
        candidates.set(uid, {
          _id: doc.userId,
          fullName:
            doc.fullName ||
            doc.name ||
            doc.personalInfo?.name ||
            doc.personalInfo?.email ||
            'Unknown',
          email: (doc.email || doc.personalInfo?.email || doc.contact?.email || '').toLowerCase(),
          phone: doc.personalInfo?.phone || doc.phone || '+0000000000',
          typeUser: name === 'companies' ? 'company' : 'rep',
          sources: new Set([name]),
        });
      } else {
        candidates.get(uid).sources.add(name);
        const c = candidates.get(uid);
        if (!c.email && doc.personalInfo?.email) c.email = doc.personalInfo.email.toLowerCase();
        if (!c.fullName && doc.personalInfo?.name) c.fullName = doc.personalInfo.name;
        if (c.phone === '+0000000000' && doc.personalInfo?.phone) c.phone = doc.personalInfo.phone;
      }
    }
  }

  console.log('Existing users:', existingUsers.length);
  console.log('Recoverable missing users:', candidates.size);
  console.log('\n--- Preview ---');
  [...candidates.values()]
    .sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)))
    .forEach((u) => {
      console.log(
        `${u._id} | ${u.fullName} | ${u.email || 'NO_EMAIL'} | ${u.typeUser} | ${[...u.sources].join(',')}`
      );
    });

  const noEmail = [...candidates.values()].filter((u) => !u.email);
  console.log('\nWithout email:', noEmail.length);

  await mongoose.disconnect();
}

main().catch(console.error);
