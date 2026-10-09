import axios from 'axios';

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
