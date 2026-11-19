import User from '../models/User.js';
import { generateReengagementToken, hashReengagementToken } from '../utils/reengagementToken.js';
import { appLoginUrl } from './brevoMail.js';

/** Durée de validité du lien d'accès direct d'une invitation (jours). */
export function inviteLinkTtlDays() {
  const n = Number(process.env.INVITE_LOGIN_TTL_DAYS);
  return Number.isFinite(n) && n >= 1 && n <= 30 ? Math.floor(n) : 7;
}

/** Origine du site d'inscription, déduite de l'adresse de connexion configurée. */
function siteOrigin() {
  try { return new URL(appLoginUrl()).origin; } catch { return 'https://harx.ai'; }
}

/**
 * Lien d'accès direct envoyé dans l'e-mail d'invitation : il ouvre la session de la personne invitée (cliquer prouve qu'elle lit cette
 * boîte, comme le code de connexion envoyé par e-mail). Seul le SHA-256 du jeton est conservé ; le lien reste valable jusqu'à
 * `expiresAt` pour que le pré-chargement des messageries et les clics répétés ne le consomment pas. Un nouvel envoi remplace le précédent.
 * `product` : produit à ouvrir après la connexion (ex. « callcentre » pour le portail Téléphonie).
 */
export async function issueInviteLoginLink(userId, { product = '' } = {}) {
  const token = generateReengagementToken();
  const expiresAt = new Date(Date.now() + inviteLinkTtlDays() * 24 * 60 * 60 * 1000);
  await User.updateOne({ _id: userId }, { $set: { 'inviteLogin.tokenHash': hashReengagementToken(token), 'inviteLogin.expiresAt': expiresAt } });
  const params = new URLSearchParams();
  if (product) params.set('product', product);
  params.set('t', token);
  return `${siteOrigin()}/auth/invite?${params.toString()}`;
}
