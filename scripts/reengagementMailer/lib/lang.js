// Language of the e-mail for one recipient: 'fr', 'en' or 'bi' (French + English in the same message).
// Declared languages win; then the country; otherwise the bilingual version.

const FR_COUNTRIES = new Set([
  'France', 'Morocco', 'Tunisia', 'Algeria', 'Senegal', 'Benin', 'Togo', "Côte d'Ivoire", 'Mali', 'Gabon',
  'Burkina Faso', 'Niger', 'Chad', 'Mauritania', 'Guinea', 'Central African', 'Comoros', 'Republic of the Congo',
  'The Democratic Republic Of The Congo', 'Madagascar', 'Djibouti',
]);

const EN_COUNTRIES = new Set([
  'Nigeria', 'South Africa', 'Jamaica', 'Trinidad and Tobago', 'Kenya', 'Ghana', 'Philippines', 'United States',
  'United Kingdom', 'Australia', 'Pakistan', 'Malawi', 'Belize', 'Gambia', 'Ireland', 'India', 'Uganda',
  'Zimbabwe', 'Zambia', 'Tanzania',
]);

export const LANGS = ['fr', 'en', 'bi'];

const names = (languages) =>
  (Array.isArray(languages) ? languages : [])
    .map((l) => (typeof l === 'string' ? l : l?.language || l?.name || ''))
    .map((l) => l.trim().toLowerCase());

export function chooseLanguage({ languages, country } = {}) {
  const declared = names(languages);
  const hasFr = declared.some((l) => l.startsWith('fr'));
  const hasEn = declared.some((l) => l.startsWith('en'));
  if (hasFr && hasEn) return 'bi';
  if (hasFr) return 'fr';
  if (hasEn) return 'en';
  if (FR_COUNTRIES.has(country)) return 'fr';
  if (EN_COUNTRIES.has(country)) return 'en';
  return 'bi';
}
