const EMAIL_RE = /^[a-z0-9._%+\-]+@[a-z0-9\-]+(\.[a-z0-9\-]+)+$/i;

/** Parse the `email,token` CSV written by importV1Reps.js --tokens-out. Skips invalid lines. */
export function parseTokens(content) {
  const rows = [];
  const invalid = [];
  const seen = new Set();
  const lines = String(content).split(/\r?\n/);
  lines.forEach((line, i) => {
    const raw = line.trim();
    if (!raw || (i === 0 && raw.toLowerCase().startsWith('email,'))) return;
    const comma = raw.indexOf(',');
    const email = (comma > 0 ? raw.slice(0, comma) : '').trim().toLowerCase();
    const token = (comma > 0 ? raw.slice(comma + 1) : '').trim();
    if (!EMAIL_RE.test(email) || token.length < 32 || token.length > 128) {
      invalid.push(i + 1);
      return;
    }
    if (seen.has(email)) return;
    seen.add(email);
    rows.push({ email, token });
  });
  return { rows, invalid };
}

export function parseEmailList(content) {
  return new Set(
    String(content)
      .split(/\r?\n/)
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l && !l.startsWith('#') && EMAIL_RE.test(l))
  );
}

export function maskEmail(email) {
  const [local = '', domain = ''] = String(email).split('@');
  return `${local.slice(0, 1)}***@${domain.slice(0, 1)}***${domain.slice(domain.lastIndexOf('.'))}`;
}
