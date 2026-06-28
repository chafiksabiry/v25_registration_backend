#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, '../../v25_dash_rep_back/package.json'));
const { v2: cloudinary } = require('cloudinary');

dotenv.config({ path: path.join(__dirname, '../../v25_dash_rep_back/.env') });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Mamour photo uploaded v1782592370 (~2026-06-27T20:32)
const photoTs = 1782592370;
const window = 7200; // 2h

async function list(prefix, type) {
  const results = [];
  let next;
  do {
    const r = await cloudinary.api.resources({
      type: 'upload',
      resource_type: type,
      prefix,
      max_results: 500,
      next_cursor: next,
    });
    results.push(...(r.resources || []));
    next = r.next_cursor;
  } while (next);
  return results;
}

const [exp, pres] = await Promise.all([
  list('experience-videos/', 'video'),
  list('rep-profile-videos/', 'video'),
]);

console.log('=== Videos near Mamour photo session (v1782592370 ±2h) ===\n');
for (const r of [...exp, ...pres]) {
  const m = r.secure_url.match(/\/v(\d+)\//);
  if (!m) continue;
  const v = Number(m[1]);
  if (Math.abs(v - photoTs) <= window) {
    console.log(`${r.created_at} | ${r.public_id}`);
    console.log(`  ${r.secure_url}\n`);
  }
}

console.log('=== All videos 2026-06-27 (any time) ===\n');
for (const r of [...exp, ...pres]) {
  const d = new Date(r.created_at);
  if (d >= new Date('2026-06-27T00:00:00Z') && d < new Date('2026-06-28T00:00:00Z')) {
    console.log(`${r.created_at} | ${r.public_id}`);
    console.log(`  ${r.secure_url}\n`);
  }
}
