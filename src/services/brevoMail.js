import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import nodemailer from 'nodemailer';
import { HARX_LOGO_CID, HARX_LOGO_SRC, harxLogoUrl } from '../utils/harxMessages.js';
import { NOMAD_WORDMARK_CID, NOMAD_WORDMARK_SRC, nomadWordmarkUrl } from '../utils/nomadAppMessages.js';

export const HARX_LOGO_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'harx-email-logo.jpg');
/** Mot-symbole NOMAD des e-mails de l'app (cid:nomad-wordmark). */
export const NOMAD_WORDMARK_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'nomad-wordmark-email.png');

/** Remplace les images intégrées (cid:harx-logo, cid:nomad-wordmark) par leur URL publique, pour un envoi sans pièce jointe inline. */
export function withRemoteLogo(html) {
  return typeof html === 'string' ? html.split(HARX_LOGO_SRC).join(harxLogoUrl()).split(NOMAD_WORDMARK_SRC).join(nomadWordmarkUrl()) : html;
}

/**
 * Pièces jointes inline du relais SMTP : le bandeau HARX est embarqué dans le message
 * (Content-ID harx-logo), donc affiché sans que le destinataire autorise les images distantes.
 * Sans le fichier, l'image repasse en URL distante.
 */
export function inlineLogoMail(html) {
  if (typeof html !== 'string') return { html, attachments: [] };
  const attachments = [];
  let out = html;
  if (out.includes(HARX_LOGO_SRC)) {
    if (fs.existsSync(HARX_LOGO_FILE)) {
      attachments.push({ filename: 'harx-logo.jpg', path: HARX_LOGO_FILE, cid: HARX_LOGO_CID, contentType: 'image/jpeg', contentDisposition: 'inline' });
    } else out = out.split(HARX_LOGO_SRC).join(harxLogoUrl());
  }
  if (out.includes(NOMAD_WORDMARK_SRC)) {
    if (fs.existsSync(NOMAD_WORDMARK_FILE)) {
      attachments.push({ filename: 'nomad-wordmark.png', path: NOMAD_WORDMARK_FILE, cid: NOMAD_WORDMARK_CID, contentType: 'image/png', contentDisposition: 'inline' });
    } else out = out.split(NOMAD_WORDMARK_SRC).join(nomadWordmarkUrl());
  }
  return { html: out, attachments };
}

/** En-têtes supplémentaires permis (désabonnement en un clic, RFC 2369 / RFC 8058) ; tout autre en-tête est ignoré. */
const EXTRA_HEADERS = ['List-Unsubscribe', 'List-Unsubscribe-Post'];
export function pickMailHeaders(headers) {
  const out = {};
  if (!headers || typeof headers !== 'object') return out;
  for (const k of EXTRA_HEADERS) if (typeof headers[k] === 'string' && headers[k] && !/[\r\n]/.test(headers[k])) out[k] = headers[k];
  return out;
}

export async function sendBrevoEmail({ to, subject, html, text, headers }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.BREVO_FROM_EMAIL || process.env.SMTP_FROM_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || process.env.SMTP_FROM_NAME || 'HARX';
  if (!apiKey || !senderEmail) {
    throw new Error('Server misconfiguration: Missing BREVO_API_KEY or BREVO_SENDER_EMAIL.');
  }

  try {
    const { data } = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to }],
        replyTo: { email: senderEmail, name: senderName },
        subject,
        // L'API transactionnelle n'accepte pas d'image inline (Content-ID) : URL publique du bandeau.
        htmlContent: withRemoteLogo(html),
        ...(text ? { textContent: text } : {}),
        ...(Object.keys(pickMailHeaders(headers)).length ? { headers: pickMailHeaders(headers) } : {}),
      },
      {
        headers: {
          'api-key': apiKey,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        timeout: 15000,
      }
    );
    return data;
  } catch (error) {
    const detail = error.response?.data?.message || error.message || 'Failed to send email';
    throw new Error(`Brevo: ${detail}`);
  }
}

async function sendSmtpEmail({ to, subject, html, text, headers }) {
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
  const fromName = process.env.SMTP_FROM_NAME || 'HARX';
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  const inline = inlineLogoMail(html);
  return transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    replyTo: fromEmail,
    to,
    subject,
    html: inline.html,
    ...(text ? { text } : {}),
    ...(inline.attachments.length ? { attachments: inline.attachments } : {}),
    ...(Object.keys(pickMailHeaders(headers)).length ? { headers: pickMailHeaders(headers) } : {}),
  });
}

export function appLoginUrl() {
  if (process.env.AGENT_INVITE_LOGIN_URL) return process.env.AGENT_INVITE_LOGIN_URL;
  const base = (process.env.FRONTEND_URL || process.env.VITE_FRONTEND_URL || 'https://harx.ai').replace(/\/$/, '');
  if (base.endsWith('/auth')) return `${base}/signin`;
  return `${base}/auth/signin`;
}

export async function sendAppEmail({ to, subject, html, text, headers }) {
  const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.BREVO_FROM_EMAIL || process.env.SMTP_FROM_EMAIL;
  let apiError = null;
  if (process.env.BREVO_API_KEY && senderEmail) {
    try {
      return await sendBrevoEmail({ to, subject, html, text, headers });
    } catch (error) {
      apiError = error;
      console.error('Brevo API send failed, trying SMTP:', error.message);
    }
  }
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return sendSmtpEmail({ to, subject, html, text, headers });
  }
  if (apiError) throw apiError;
  throw new Error('Server misconfiguration: Missing BREVO_API_KEY or SMTP credentials.');
}
