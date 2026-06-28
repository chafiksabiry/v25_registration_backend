#!/usr/bin/env node
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../v25_dash_rep_back/.env') });
dotenv.config();

const email = process.argv.find((a) => a.includes('@')) || 'mamour.kasse.sn@gmail.com';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const agent = await db.collection('agents').findOne({ 'personalInfo.email': email });
console.log(JSON.stringify(agent, null, 2));
await mongoose.disconnect();
