/**
 * Derive the reference data of a Timezone document (countryName, gmtOffset)
 * from an IANA zone name and an ISO 3166-1 alpha-2 country code, using the
 * runtime's ICU data. Used to add a zone that is missing from the `timezones`
 * collection instead of leaving the user without a timezone.
 *
 * gmtOffset is in seconds and is the STANDARD (non-DST) offset, which is what
 * the seeded data (TimezoneDB) stores.
 */

const offsetSecondsAt = (timeZone, date) => {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName');
  const value = part ? part.value : '';
  if (value === 'GMT') return 0;
  const m = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(value);
  if (!m) return null;
  const seconds = Number(m[2]) * 3600 + Number(m[3] || 0) * 60;
  return m[1] === '-' ? -seconds : seconds;
};

export function standardOffsetSeconds(timeZone, now = new Date()) {
  try {
    const year = now.getUTCFullYear();
    const jan = offsetSecondsAt(timeZone, new Date(Date.UTC(year, 0, 1)));
    const jul = offsetSecondsAt(timeZone, new Date(Date.UTC(year, 6, 1)));
    if (jan === null || jul === null) return null;
    return Math.min(jan, jul);
  } catch {
    return null; // not a valid IANA zone for this runtime
  }
}

export function countryNameFromCode(countryCode, locale = 'en') {
  try {
    const code = String(countryCode || '').toUpperCase();
    // ZZ is the ICU placeholder for "Unknown Region", not a real country.
    if (!/^[A-Z]{2}$/.test(code) || code === 'ZZ') return null;
    // fallback:'none' returns undefined for an unknown region instead of a
    // placeholder such as "Unknown Region".
    const name = new Intl.DisplayNames([locale], { type: 'region', fallback: 'none' }).of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

/** @returns {{countryCode, countryName, zoneName, gmtOffset} | null} */
export function buildTimezoneDoc(countryCode, zoneName) {
  const code = String(countryCode || '').toUpperCase();
  const zone = String(zoneName || '').trim();
  const countryName = countryNameFromCode(code);
  const gmtOffset = standardOffsetSeconds(zone);
  if (!zone || !countryName || gmtOffset === null) return null;
  return { countryCode: code, countryName, zoneName: zone, gmtOffset };
}
