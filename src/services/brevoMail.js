import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import nodemailer from 'nodemailer';
import { HARX_LOGO_CID, HARX_LOGO_SRC, harxLogoUrl } from '../utils/harxMessages.js';

export const HARX_LOGO_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'harx-email-logo.jpg');

/** Remplace l'image intégrée (cid:harx-logo) par son URL publique, pour un envoi sans pièce jointe inline. */
export function withRemoteLogo(html) {
  return typeof html === 'string' ? html.split(HARX_LOGO_SRC).join(harxLogoUrl()) : html;
}

/**
 * Pièces jointes inline du relais SMTP : le bandeau HARX est embarqué dans le message
 * (Content-ID harx-logo), donc affiché sans que le destinataire autorise les images distantes.
 * Sans le fichier, l'image repasse en URL distante.
 */
export function inlineLogoMail(html) {
  if (typeof html !== 'string' || !html.includes(HARX_LOGO_SRC)) return { html, attachments: [] };
  if (!fs.existsSync(HARX_LOGO_FILE)) return { html: withRemoteLogo(html), attachments: [] };
  return {
    html,
    attachments: [{
      filename: 'harx-logo.jpg',
      path: HARX_LOGO_FILE,
      cid: HARX_LOGO_CID,
      contentType: 'image/jpeg',
      contentDisposition: 'inline',
    }],
  };
}

export async function sendBrevoEmail({ to, subject, html, text }) {
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

async function sendSmtpEmail({ to, subject, html, text }) {
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
  });
}

export function appLoginUrl() {
  if (process.env.AGENT_INVITE_LOGIN_URL) return process.env.AGENT_INVITE_LOGIN_URL;
  const base = (process.env.FRONTEND_URL || process.env.VITE_FRONTEND_URL || 'https://harx.ai').replace(/\/$/, '');
  if (base.endsWith('/auth')) return `${base}/signin`;
  return `${base}/auth/signin`;
}

export async function sendAppEmail({ to, subject, html, text }) {
  const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.BREVO_FROM_EMAIL || process.env.SMTP_FROM_EMAIL;
  let apiError = null;
  if (process.env.BREVO_API_KEY && senderEmail) {
    try {
      return await sendBrevoEmail({ to, subject, html, text });
    } catch (error) {
      apiError = error;
      console.error('Brevo API send failed, trying SMTP:', error.message);
    }
  }
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return sendSmtpEmail({ to, subject, html, text });
  }
  if (apiError) throw apiError;
  throw new Error('Server misconfiguration: Missing BREVO_API_KEY or SMTP credentials.');
}
