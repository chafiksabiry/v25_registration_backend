/**
 * Contrôle de qualité d'une adresse e-mail AVANT envoi : écarte les adresses presque certainement invalides
 * (fautes de frappe de domaine, adresses de test) pour éviter les rebonds et protéger la réputation de l'expéditeur.
 * Ne vérifie jamais l'existence réelle de la boîte : c'est un filtre prudent, pas une validation.
 */
export const TYPO_DOMAINS = {
  'gmai.com': 'gmail.com', 'gmaim.com': 'gmail.com', 'gfmail.com': 'gmail.com', 'gmail.co': 'gmail.com',
  'gmial.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmail.con': 'gmail.com', 'gmaill.com': 'gmail.com',
  'gnail.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmil.com': 'gmail.com', 'gmail.cm': 'gmail.com',
  'gmail.om': 'gmail.com', 'gmail.fr.com': 'gmail.com',
  'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'hotmai.com': 'hotmail.com',
  'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yahoo.co': 'yahoo.com', 'yaoo.com': 'yahoo.com',
  'outlok.com': 'outlook.com', 'outloo.com': 'outlook.com',
};

// Extensions génériques courantes acceptées ; toute extension de 2 lettres (code pays) est acceptée aussi.
// Une adresse dont l'extension n'est ni l'une ni l'autre (ex. « .comg », « .cmo », « .coom ») est presque certainement une faute de frappe.
const COMMON_TLDS = new Set([
  'com', 'net', 'org', 'edu', 'gov', 'mil', 'int', 'info', 'biz', 'name', 'pro', 'mobi', 'asia', 'tel', 'travel', 'jobs',
  'app', 'dev', 'online', 'tech', 'xyz', 'site', 'store', 'shop', 'club', 'live', 'cloud', 'email', 'space', 'world',
  'today', 'life', 'digital', 'top', 'vip', 'agency', 'group', 'link', 'news', 'media', 'network', 'solutions',
  'services', 'company', 'business', 'consulting', 'center', 'team', 'work', 'works', 'studio', 'design', 'blog',
  'academy', 'education', 'school', 'university', 'finance', 'bank', 'money', 'health', 'care', 'global', 'zone',
  'expert', 'tools', 'systems', 'support', 'center', 'directory', 'foundation', 'community', 'social', 'page', 'website',
]);
function hasValidExtension(domain) {
  const tld = String(domain).split('.').pop();
  return /^[a-z]{2}$/.test(tld) || COMMON_TLDS.has(tld);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Parties locales typiques de tests : test, asdf, qwerty, aaa, kkk, xxx…
const TEST_LOCAL = /^(test|tests|testing|essai|demo|fake|faux|asdf|asdfg|qwerty|azerty|abc|abcd|aaa+|bbb+|ccc+|kkk+|xxx+|zzz+|fff+|ggg+|hhh+)\d*$/;

/** Retourne null si l'adresse paraît correcte, sinon la raison de l'exclusion. */
export function suspiciousEmailReason(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return 'vide';
  if (!EMAIL_RE.test(e)) return 'format_invalide';
  const [local, domain] = e.split('@');
  if (TYPO_DOMAINS[domain]) return `domaine_suspect:${domain}`;
  if (!hasValidExtension(domain)) return 'extension_invalide';
  if (TEST_LOCAL.test(local)) return 'adresse_de_test';
  if (/^(.)\1{2,}$/.test(local)) return 'adresse_de_test'; // même caractère répété (fffff)
  if (local.length <= 2) return 'partie_locale_trop_courte';
  return null;
}
