import fs from 'fs';

/** Append-only JSONL record of every attempt, so a run can be stopped and resumed without double sends. */
export function readLedger(path) {
  const state = new Map();
  if (!path || !fs.existsSync(path)) return state;
  for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.email) state.set(entry.email, entry);
    } catch {
      /* ignore a truncated last line */
    }
  }
  return state;
}

export function appendLedger(path, entry) {
  fs.appendFileSync(path, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
}
