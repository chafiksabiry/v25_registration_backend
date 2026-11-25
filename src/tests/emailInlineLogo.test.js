import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import nodemailer from 'nodemailer';
import * as messages from '../utils/harxMessages.js';
import { sendAppEmail, HARX_LOGO_FILE, inlineLogoMail } from '../services/brevoMail.js';

// Aucun vrai envoi : transports remplacés, variables d'environnement factices.
const ENV_KEYS = ['BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'BREVO_FROM_EMAIL', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM_EMAIL', 'PUBLIC_API_URL'];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
function resetEnv() { for (const k of ENV_KEYS) delete process.env[k]; }
function restoreEnv() { for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; } }

const realCreateTransport = nodemailer.createTransport;
const realPost = axios.post;
function captureSmtp() {
  const sent = [];
  nodemailer.createTransport = () => ({ sendMail: async (mail) => { sent.push(mail); return { messageId: 'test' }; } });
  return sent;
}
function captureBrevo({ fail = false } = {}) {
  const calls = [];
  axios.post = async (url, body) => {
    calls.push({ url, body });
    if (fail) { const e = new Error('Request failed'); e.response = { data: { message: 'Key not found' } }; throw e; }
    return { data: { messageId: 'brevo-test' } };
  };
  return calls;
}
function restoreTransports() { nodemailer.createTransport = realCreateTransport; axios.post = realPost; }
function smtpEnv() { process.env.SMTP_HOST = 'smtp.example.test'; process.env.SMTP_USER = 'u'; process.env.SMTP_PASS = 'p'; process.env.SMTP_FROM_EMAIL = 'no-reply@example.test'; }

test.afterEach(() => { restoreTransports(); restoreEnv(); });

const verification = () => messages.verificationEmail({ code: '123456' });

test('le bandeau des e-mails HARX est une image intégrée (cid:harx-logo), même mise en page', () => {
  const { html } = verification();
  assert.ok(html.includes('<img src="cid:harx-logo" width="560" alt="HARX"'), 'src en cid:, largeur 560, alt HARX');
  assert.ok(html.includes('max-width:560px'), 'max-width conservé');
  assert.ok(!html.includes('/email/logo-pink.png'), 'plus d’URL distante dans le gabarit');
});

test('tous les e-mails construits sur harxEmailShell portent le bandeau intégré', () => {
  const src = fs.readFileSync(fileURLToPath(new URL('../utils/harxMessages.js', import.meta.url)), 'utf8');
  const shells = (src.match(/html: harxEmailShell\(/g) || []).length;
  assert.ok(shells >= 10, `au moins 10 gabarits (trouvé ${shells})`);
  assert.equal((src.match(/<img /g) || []).length, 1, 'une seule balise <img> : celle du shell');
  // Échantillon : inscription, liste d'attente, invitation d'équipe
  for (const m of [
    verification(),
    messages.countryWaitlistEmail({ countryName: 'Allemagne', locale: 'fr' }),
    messages.teamMemberInvitationEmail({ firstName: 'Ada', companyName: 'Acme', preset: 'agent', inviterName: 'Bob', email: 'ada@acme.fr', tempPassword: 'x', loginUrl: 'https://exemple.fr' }),
  ]) assert.ok(m.html.includes('src="cid:harx-logo"'));
});

test('relais SMTP : pièce jointe inline avec le même Content-ID', async () => {
  resetEnv(); smtpEnv();
  const sent = captureSmtp();
  const { subject, html, text } = verification();
  await sendAppEmail({ to: 'test@example.test', subject, html, text });
  assert.equal(sent.length, 1);
  const mail = sent[0];
  assert.ok(mail.html.includes('src="cid:harx-logo"'));
  assert.equal(mail.attachments.length, 1);
  const [att] = mail.attachments;
  assert.equal(att.cid, 'harx-logo');
  assert.equal(att.contentType, 'image/jpeg');
  assert.equal(att.contentDisposition, 'inline');
  assert.equal(att.path, HARX_LOGO_FILE);
  assert.ok(fs.existsSync(att.path), 'le fichier joint existe');
});

test('relais SMTP : le message MIME contient bien l’image inline (multipart/related)', async () => {
  const transport = realCreateTransport({ streamTransport: true, buffer: true });
  const { html } = verification();
  const inline = inlineLogoMail(html);
  const info = await transport.sendMail({ from: 'a@example.test', to: 'b@example.test', subject: 's', html: inline.html, attachments: inline.attachments });
  const raw = info.message.toString();
  assert.match(raw, /multipart\/related/);
  assert.match(raw, /Content-ID: <harx-logo>/);
  assert.match(raw, /Content-Type: image\/jpeg/);
  assert.match(raw, /Content-Disposition: inline/);
});

test('relais SMTP : un e-mail sans bandeau n’a pas de pièce jointe', async () => {
  resetEnv(); smtpEnv();
  const sent = captureSmtp();
  await sendAppEmail({ to: 'test@example.test', subject: 's', html: '<p>Bonjour</p>' });
  assert.equal(sent[0].attachments, undefined);
});

test('API Brevo (simulée) : envoi inchangé, bandeau en URL publique allégée', async () => {
  resetEnv();
  process.env.BREVO_API_KEY = 'fake-key';
  process.env.BREVO_SENDER_EMAIL = 'no-reply@example.test';
  process.env.PUBLIC_API_URL = 'https://api.example.test/';
  const calls = captureBrevo();
  const smtp = captureSmtp();
  const { subject, html, text } = verification();
  const res = await sendAppEmail({ to: 'test@example.test', subject, html, text });
  assert.deepEqual(res, { messageId: 'brevo-test' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.brevo.com/v3/smtp/email');
  const body = calls[0].body;
  assert.ok(body.htmlContent.includes('<img src="https://api.example.test/email/harx-logo.jpg"'));
  assert.ok(!body.htmlContent.includes('cid:'));
  assert.equal(body.textContent, text);
  assert.equal(smtp.length, 0, 'pas de repli SMTP');
});

test('API Brevo refusée → repli SMTP avec image inline', async () => {
  resetEnv(); smtpEnv();
  process.env.BREVO_API_KEY = 'disabled-key';
  const calls = captureBrevo({ fail: true });
  const sent = captureSmtp();
  const orig = console.error; console.error = () => {};
  try {
    await sendAppEmail({ to: 'test@example.test', subject: 's', html: verification().html });
  } finally { console.error = orig; }
  assert.equal(calls.length, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].attachments[0].cid, 'harx-logo');
});

test('le nouveau bandeau est léger (< 60 Ko), 1120 px de large ; l’ancien reste servi', () => {
  const size = fs.statSync(HARX_LOGO_FILE).size;
  assert.ok(size < 60 * 1024, `harx-email-logo.jpg = ${size} octets`);
  const buf = fs.readFileSync(HARX_LOGO_FILE);
  assert.equal(buf[0], 0xff); assert.equal(buf[1], 0xd8); // JPEG
  // Largeur lue dans le segment SOF
  let i = 2; let width = 0;
  while (i < buf.length) {
    const marker = buf[i + 1]; const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc2) { width = buf.readUInt16BE(i + 7); break; }
    i += 2 + len;
  }
  assert.equal(width, 1120);
  const old = path.join(path.dirname(HARX_LOGO_FILE), 'logo-pink.png');
  assert.ok(fs.existsSync(old), 'logo-pink.png conservé pour /email/logo-pink.png');
  const index = fs.readFileSync(fileURLToPath(new URL('../index.js', import.meta.url)), 'utf8');
  assert.ok(index.includes("'/email/logo-pink.png'") && index.includes("'/email/harx-logo.jpg'"));
});
