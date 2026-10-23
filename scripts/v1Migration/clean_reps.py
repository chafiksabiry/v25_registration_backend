"""Clean the HARX v1 REPS export and write one JSON object per rep (JSONL) + a CSV for review.

Usage: python3 -I clean_reps.py <input.xlsx> <output_dir>
Nothing here touches a database.
"""
import json
import re
import sys
from collections import Counter

import pandas as pd

SRC, OUT = sys.argv[1], sys.argv[2]

# Unambiguous typos only. gmail.co / gmail.fr are left alone (real or plausible domains).
DOMAIN_FIX = {
    'gmail.con': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com',
    'gmail.comm': 'gmail.com', 'gmail.comn': 'gmail.com', 'gmail.coma': 'gmail.com',
    'gamail.com': 'gmail.com', 'gmil.com': 'gmail.com', 'glail.com': 'gmail.com',
    'gnail.com': 'gmail.com', 'gmail.col': 'gmail.com', 'gmal.com': 'gmail.com',
    'gemail.com': 'gmail.com', 'gmial.com': 'gmail.com', 'gmaill.com': 'gmail.com',
    'gmail.cm': 'gmail.com', 'gmail.om': 'gmail.com', 'hotmail.con': 'hotmail.com',
    'yahoo.con': 'yahoo.com', 'outlook.con': 'outlook.com',
}
EMAIL_RE = re.compile(r'^[a-z0-9._%+\-]+@[a-z0-9\-]+(\.[a-z0-9\-]+)+$')


def demojibake(s):
    if not isinstance(s, str):
        return s
    if any(m in s for m in ('Ã', 'Â', 'â€')):
        try:
            return s.encode('latin1').decode('utf8')
        except (UnicodeEncodeError, UnicodeDecodeError):
            return s
    return s


def clean_text(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = demojibake(str(v)).strip()
    s = re.sub(r'\s+', ' ', s)
    return s or None


def tidy_name(v):
    s = clean_text(v)
    if not s:
        return None
    return s.title() if (s.isupper() or s.islower()) else s


df = pd.read_excel(SRC, sheet_name='Base')

# dial code -> country, learned from the file itself (rows that have both)
known = df.dropna(subset=['country', 'dial_code'])
dial_country = (
    known.assign(country=known['country'].map(clean_text))
    .groupby('dial_code')['country'].agg(lambda s: s.value_counts().index[0]).to_dict()
)

rows, excluded = [], []
stats = Counter()
seen = set()
now = pd.Timestamp('2024-11-14', tz='UTC')

for r in df.to_dict('records'):
    raw_email = str(r['email']).strip().lower()
    email = raw_email
    local, _, dom = raw_email.rpartition('@')
    fixed = False
    if dom in DOMAIN_FIX:
        email, fixed = f'{local}@{DOMAIN_FIX[dom]}', True
        stats['email_domain_fixed'] += 1
    if not EMAIL_RE.match(email):
        excluded.append({'email': raw_email, 'reason': 'invalid_email_format'})
        continue
    if email in seen:
        excluded.append({'email': email, 'reason': 'duplicate_after_fix'})
        continue
    seen.add(email)

    first, last = tidy_name(r['firstname']), tidy_name(r['lastname'])
    full = ' '.join(x for x in (first, last) if x)
    name_source = 'names'
    if not full:
        full = clean_text(r['username'])
        name_source = 'username'
    if not full:
        full = local.split('+')[0]
        name_source = 'email'
    if name_source != 'names':
        stats['name_fallback_' + name_source] += 1

    # phone -> E.164
    phone = None
    digits = re.sub(r'\D', '', str(r['Phone Number'])) if pd.notna(r['Phone Number']) else ''
    if digits:
        if 8 <= len(digits) <= 15:
            phone = '+' + digits
        else:
            stats['phone_invalid_length'] += 1

    country = clean_text(r['country'])
    dial = r['dial_code'] if pd.notna(r['dial_code']) else None
    if not country and dial in dial_country:
        country = dial_country[dial]
        stats['country_from_dial_code'] += 1

    comp = bool(r['step.is_completed'])
    has_profile = pd.notna(r['gender'])
    segment = 'A' if comp else ('C' if has_profile else 'D')

    lst = lambda cols: [clean_text(r[c]) for c in cols if pd.notna(r[c]) and clean_text(r[c])]
    langs = lst([f'languages_level[{i}]' for i in range(4)])
    acts = lst([f'ACT {i}' for i in range(1, 11)])
    sects = lst([f'SECT {i}' for i in range(1, 9)])

    birth = pd.to_datetime(r['birthDate'], errors='coerce', utc=True)
    if pd.notna(birth):
        age = (now - birth).days / 365.25
        birth = birth.date().isoformat() if 16 <= age <= 80 else None
    else:
        birth = None

    created = pd.to_datetime(r['createdAt'], errors='coerce', utc=True)
    gender = {'Homme': 'male', 'Femme': 'female'}.get(r['gender'])

    # hint only: order of the two names inside the e-mail local part
    ln = re.sub(r'[^a-z]', '', local)
    f_, l_ = re.sub(r'[^a-z]', '', (first or '').lower()), re.sub(r'[^a-z]', '', (last or '').lower())
    hint = 'unknown'
    if len(f_) > 2 and len(l_) > 2 and f_ in ln and l_ in ln:
        hint = 'first-last' if ln.find(f_) < ln.find(l_) else 'last-first'

    rows.append({
        'email': email, 'emailOriginal': raw_email if fixed else None,
        'fullName': full, 'nameSource': name_source,
        'firstName': first, 'lastName': last, 'nameOrderHint': hint,
        'phone': phone, 'country': country,
        'segment': segment, 'v1OnboardingCompleted': comp,
        'languages': langs, 'activities': acts, 'sectors': sects,
        'experience': r['experience'] if r['experience'] != 'NONE' else None,
        'gender': gender, 'birthDate': birth,
        'v1CreatedAt': created.isoformat() if pd.notna(created) else None,
    })

with open(f'{OUT}/reps_clean.jsonl', 'w', encoding='utf8') as f:
    for x in rows:
        f.write(json.dumps(x, ensure_ascii=False) + '\n')
pd.DataFrame(rows).to_csv(f'{OUT}/reps_clean.csv', index=False)
pd.DataFrame(excluded).to_csv(f'{OUT}/reps_excluded.csv', index=False)

seg = Counter(x['segment'] for x in rows)
print('input rows', len(df))
print('kept', len(rows), 'excluded', len(excluded), Counter(e['reason'] for e in excluded))
print('segments', dict(seg))
print('with phone', sum(1 for x in rows if x['phone']))
print('no phone by segment', dict(Counter(x['segment'] for x in rows if not x['phone'])))
print(dict(stats))
print('nameOrderHint', dict(Counter(x['nameOrderHint'] for x in rows)))
