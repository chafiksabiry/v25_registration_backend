/**
 * « en France », « au Maroc », « aux États-Unis », « à Malte » : préposition française devant un nom de pays.
 * Tables courtes pour les cas qui ne prennent pas « en » ; « en » pour un nom féminin (finissant par « e ») ou commençant
 * par une voyelle ; sinon, tournure neutre « dans le pays : X » plutôt qu'une faute.
 */
const AU = new Set([
  'MA', 'CA', 'BR', 'JP', 'PT', 'SN', 'CM', 'MX', 'GB', 'DK', 'LU', 'LB', 'PE', 'CL', 'VN', 'PK', 'NG', 'KE', 'GH', 'BJ', 'TG',
  'ML', 'NE', 'BF', 'GA', 'CG', 'CD', 'RW', 'BI', 'QA', 'KW', 'VE', 'PY', 'GT', 'HN', 'SV', 'NI', 'CR', 'PA', 'KH', 'LA', 'NP',
  'BD', 'LK', 'KZ', 'MZ', 'ZW', 'BW', 'MW', 'TD', 'SD', 'YE', 'ME', 'XK', 'LI', 'VA', 'BZ', 'BT', 'MM', 'TJ', 'KG', 'TM',
  'LS', 'LR', 'ZA', 'DJ', 'CV', 'SS', 'ER',
]);
const AUX = new Set(['US', 'NL', 'AE', 'PH', 'KM', 'MV', 'SC', 'BS', 'MH', 'SB', 'FJ']);
const A = new Set(['MT', 'SG', 'MC', 'CY', 'CU', 'MU', 'MG', 'HK', 'BH', 'OM', 'TW', 'HT', 'BB', 'SM', 'AD', 'TT', 'LC', 'GD', 'DM', 'KN', 'VC', 'AG', 'ST', 'TO', 'NR', 'TV', 'KI', 'PW', 'VU', 'WS', 'MO']);
const LABEL = { AU: 'au', AUX: 'aux', A: 'à' };

export function frInCountry(code, name) {
  const cc = String(code || '').toUpperCase();
  const n = String(name || cc).trim();
  if (AUX.has(cc)) return `aux ${n}`;
  if (A.has(cc)) return `à ${n}`;
  if (AU.has(cc)) return /^[aeiouyhâàéèêëîïôöûüÉÈÊÂÎÔ]/i.test(n) ? `en ${n}` : `au ${n}`;
  if (/^[aeiouyhâàéèêëîïôöûüÉÈÊÂÎÔ]/i.test(n) || /e$/i.test(n)) return `en ${n}`;
  return `dans le pays : ${n}`;
}

export const FR_COUNTRY_PREPOSITION_TABLES = { AU, AUX, A, LABEL };
