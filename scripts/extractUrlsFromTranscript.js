#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transcript =
  'C:/Users/QARA/.cursor/projects/d-HARX2026/agent-transcripts/e8c5cb12-01e5-403d-af66-40683b71b61a/e8c5cb12-01e5-403d-af66-40683b71b61a.jsonl';

const emails = [
  'mamour.kasse.sn@gmail.com',
  'riksabiry@gmail.com',
  'zdz89175@gmail.com',
  'rali.sabiry2018@gmail.com',
  'nakbinakbi@gmail.com',
];

const text = fs.readFileSync(transcript, 'utf8');
const urlRe = /https:\/\/res\.cloudinary\.com\/dyqg8x26j\/[^"'\\]+/g;

for (const email of emails) {
  const urls = new Set();
  const idx = text.indexOf(email);
  if (idx < 0) {
    console.log(`\n${email}: not in transcript`);
    continue;
  }
  // scan windows around each email occurrence
  let pos = 0;
  while (true) {
    const i = text.indexOf(email, pos);
    if (i < 0) break;
    const chunk = text.slice(Math.max(0, i - 8000), i + 8000);
    for (const m of chunk.matchAll(urlRe)) urls.add(m[0]);
    pos = i + email.length;
  }
  console.log(`\n${email}: ${urls.size} cloudinary url(s) nearby in transcript`);
  [...urls].forEach((u) => console.log(`  ${u}`));
}

// all unique urls in transcript
const all = [...new Set(text.match(urlRe) || [])];
console.log(`\nTotal unique cloudinary URLs in transcript: ${all.length}`);
