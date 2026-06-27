#!/usr/bin/env node
import fs from 'fs';

const transcript =
  'C:/Users/QARA/.cursor/projects/d-HARX2026/agent-transcripts/e8c5cb12-01e5-403d-af66-40683b61a/e8c5cb12-01e5-403d-af66-40683b71b61a.jsonl';

const line1 = fs.readFileSync(transcript, 'utf8').split('\n')[0];
const parsed = JSON.parse(line1);
const text = parsed.message.content[0].text.replace(/^<user_query>\n/, '').replace(/\n<\/user_query>$/, '');
const logs = JSON.parse(text);

const keywords = ['videoUrl', 'cloudinary', 'personalInfo', 'experience', 'rep-profile', 'experience-videos'];
for (const kw of keywords) {
  const hits = logs.filter((l) => (l.message || '').includes(kw));
  console.log(kw, hits.length);
  if (hits.length && hits.length <= 5) hits.forEach((h) => console.log(' ', h.message.slice(0, 300)));
}

// print messages around videoUrl
const idx = logs.findIndex((l) => (l.message || '').includes('videoUrl'));
if (idx >= 0) {
  console.log('\n--- context around first videoUrl ---');
  logs.slice(Math.max(0, idx - 5), idx + 20).forEach((l) => console.log(l.message));
}
