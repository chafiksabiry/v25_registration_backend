#!/usr/bin/env node
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../v25_dash_rep_back/.env') });
dotenv.config();

const USER_ID = '6a3d78b5fdf970b023cd2390';
const EMAIL = 'mamour.kasse.sn@gmail.com';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const user = await db.collection('users').findOne({ email: EMAIL });
const agents = await db.collection('agents').find({ userId: user._id }).toArray();
const wallets = await db.collection('agentwallets').find({
  $or: [{ agentId: user._id }, { agentId: String(user._id) }, ...agents.map((a) => ({ agentId: a._id }))],
}).toArray();

console.log('user:', user._id, user.fullName);
console.log('agents:', agents.map((a) => ({ _id: a._id, status: a.status, videos: (a.experience||[]).filter(e=>e.videoUrl).length })));
console.log('wallets:', wallets.map((w) => ({ _id: w._id, agentId: w.agentId })));

await mongoose.disconnect();
