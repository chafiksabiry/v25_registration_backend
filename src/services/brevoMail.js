import axios from 'axios';
import nodemailer from 'nodemailer';

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
        htmlContent: html,
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
  return transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    replyTo: fromEmail,
    to,
    subject,
    html,
    ...(text ? { text } : {}),
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
