import mongoose from 'mongoose';

const EMAILS = [
  'chafiksabiryadmin@yopmail.com',
  'mamour.kasse.sn@gmail.com',
  'elhoucineqara250620261@yopmail.com',
  'nakbinakbi@gmail.com',
  'elhoucineqarareps2306@yopmail.com',
  'riksabiry@gmail.com',
  'zdz89175@gmail.com',
];

const URI =
  process.env.MONGODB_URI ||
  'mongodb://mongo:DiGaBWUZXCkIxlZMuntztBaFJcOlUJIg@maglev.proxy.rlwy.net:40270/harx?authSource=admin';

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;

  for (const email of EMAILS) {
    const user = await db.collection('users').findOne({ email });
    console.log('\n===', email, '===');
    console.log('user:', user ? { _id: user._id, fullName: user.fullName, typeUser: user.typeUser, isVerified: user.isVerified, createdAt: user.createdAt } : 'MISSING');

    if (user) {
      const agent = await db.collection('agents').findOne({ userId: user._id });
      const company = await db.collection('companies').findOne({ userId: user._id });
      const wallet = await db.collection('agentwallets').findOne({
        $or: [{ agentId: user._id }, ...(agent ? [{ agentId: agent._id }] : [])],
      });
      console.log('agent:', agent ? { _id: agent._id, status: agent.status, name: agent.personalInfo?.name } : 'MISSING');
      console.log('company:', company ? { _id: company._id, name: company.name } : 'none');
      console.log('wallet:', wallet ? { _id: wallet._id, agentId: wallet.agentId } : 'none');
    } else {
      const agentByEmail = await db.collection('agents').findOne({ 'personalInfo.email': email });
      console.log('agent by email only:', agentByEmail ? { _id: agentByEmail._id, userId: agentByEmail.userId } : 'none');
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
