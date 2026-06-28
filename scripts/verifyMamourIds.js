#!/usr/bin/env node
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../v25_dash_rep_back/.env') });
dotenv.config();

const USER_ID = '6a3d78b5fdf970b023cd2390';
const AGENT_ID = '6a403288ced08f5ef23a5b94';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const user = await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(USER_ID) });
const agent = await db.collection('agents').findOne({ _id: new mongoose.Types.ObjectId(AGENT_ID) });
const wallet = await db.collection('agentwallets').findOne({ agentId: new mongoose.Types.ObjectId(AGENT_ID) });

console.log('=== USER ===');
console.log(user ? { _id: user._id, fullName: user.fullName, email: user.email, phone: user.phone } : 'NOT FOUND');

console.log('\n=== AGENT ===');
if (!agent) {
  console.log('NOT FOUND');
} else {
  const linked = String(agent.userId) === USER_ID;
  console.log({
    _id: agent._id,
    userId: agent.userId,
    userIdMatch: linked,
    email: agent.personalInfo?.email,
    status: agent.status,
    photo: agent.personalInfo?.photo?.url || agent.photo?.url || null,
    presentationVideo: agent.personalInfo?.presentationVideo || null,
  });
  console.log('\nExperiences:');
  (agent.experience || []).forEach((e, i) => {
    console.log(`  ${i + 1}. ${e.title} @ ${e.company}`);
    console.log(`     video: ${e.videoUrl || '(none)'}`);
  });
}

console.log('\n=== WALLET ===');
console.log(
  wallet
    ? { _id: wallet._id, agentId: wallet.agentId, agentIdMatch: String(wallet.agentId) === AGENT_ID }
    : 'NOT FOUND'
);

await mongoose.disconnect();
