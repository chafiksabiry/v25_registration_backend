import axios from 'axios';
import { waConfig } from './config.js';

/** Découpe en morceaux < 4096 caractères (limite WhatsApp), de préférence sur un saut de ligne. */
export function chunkText(text, size = 3800) {
  const out = [];
  let rest = String(text || '');
  while (rest.length > size) {
    let cut = rest.lastIndexOf('\n', size);
    if (cut < size / 2) cut = size;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

async function post(body) {
  const c = waConfig();
  await axios.post(
    `https://graph.facebook.com/${c.apiVersion}/${c.phoneNumberId}/messages`,
    body,
    { headers: { Authorization: `Bearer ${c.accessToken}` }, timeout: 15000 },
  );
}

export async function sendWhatsappText(to, text) {
  for (const part of chunkText(text)) {
    await post({ messaging_product: 'whatsapp', to, type: 'text', text: { body: part, preview_url: false } });
  }
}

export async function markWhatsappRead(messageId) {
  await post({ messaging_product: 'whatsapp', status: 'read', message_id: messageId }).catch(() => {});
}
