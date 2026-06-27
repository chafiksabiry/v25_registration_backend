#!/usr/bin/env node
import fs from 'fs';

const transcript =
  'C:/Users/QARA/.cursor/projects/d-HARX2026/agent-transcripts/e8c5cb12-01e5-403d-af66-40683b71b61a/e8c5cb12-01e5-403d-af66-40683b71b61a.jsonl';

const line1 = fs.readFileSync(transcript, 'utf8').split('\n')[0];
const emails = [
  'mamour.kasse.sn@gmail.com',
  'riksabiry@gmail.com',
  'zdz89175@gmail.com',
];

for (const email of emails) {
  const i = line1.indexOf(email);
  console.log(`\n${email} at ${i}`);
  if (i < 0) continue;
  console.log(line1.slice(Math.max(0, i - 500), i + 500));
}

// search for experience-videos near mamour in full file
const full = fs.readFileSync(transcript, 'utf8');
for (const email of emails) {
  let pos = 0;
  let count = 0;
  while (count < 3) {
    const i = full.indexOf(email, pos);
    if (i < 0) break;
    const chunk = full.slice(i, i + 2000);
    if (chunk.includes('experience-videos') || chunk.includes('rep-profile-photos')) {
      console.log(`\n--- ${email} media context ---`);
      console.log(chunk.slice(0, 1200));
      count++;
    }
    pos = i + email.length;
  }
}
