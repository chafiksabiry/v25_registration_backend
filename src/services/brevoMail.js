import axios from 'axios';
import nodemailer from 'nodemailer';

export async function sendBrevoEmail({ to, subject, html, text }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.SMTP_FROM_EMAIL;
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

export async function sendAppEmail({ to, subject, html, text }) {
  const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.SMTP_FROM_EMAIL;
  if (process.env.BREVO_API_KEY && senderEmail) {
    return sendBrevoEmail({ to, subject, html, text });
  }
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return sendSmtpEmail({ to, subject, html, text });
  }
  throw new Error('Server misconfiguration: Missing BREVO_API_KEY or SMTP credentials.');
}
