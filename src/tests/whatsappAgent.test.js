import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { isValidMetaSignature } from '../services/whatsappAgent/signature.js';
import { chunkText } from '../services/whatsappAgent/whatsappClient.js';
import { trimHistory } from '../services/whatsappAgent/history.js';
import { runTool } from '../services/whatsappAgent/tools.js';

// Signature Meta
const body = Buffer.from('{"entry":[]}');
const good = 'sha256=' + crypto.createHmac('sha256', 'secret').update(body).digest('hex');
assert.equal(isValidMetaSignature(body, good, 'secret'), true);
assert.equal(isValidMetaSignature(body, good, 'autre'), false);
assert.equal(isValidMetaSignature(body, 'sha256=abc', 'secret'), false);
assert.equal(isValidMetaSignature(body, undefined, 'secret'), false);
assert.equal(isValidMetaSignature(undefined, good, 'secret'), false);

// Découpage des messages longs
assert.deepEqual(chunkText('court'), ['court']);
const long = ('ligne de texte\n').repeat(600);
const parts = chunkText(long);
assert.ok(parts.length > 1 && parts.every((p) => p.length <= 3800));
assert.equal(parts.join('\n').replace(/\s+/g, ''), long.replace(/\s+/g, ''));

// Historique : commence toujours par un message utilisateur texte
const h = trimHistory([
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'r' }] },
  { role: 'assistant', content: 'a' },
  { role: 'user', content: 'question' },
  { role: 'assistant', content: 'réponse' },
]);
assert.equal(h[0].content, 'question');
assert.equal(trimHistory(Array.from({ length: 50 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: String(i) }))).length <= 30, true);

// Outils : escalade + outil inconnu
let reason;
assert.match(await runTool('escalate_to_human', { reason: 'facturation' }, { onEscalate: (r) => { reason = r; } }), /Escalade enregistrée/);
assert.equal(reason, 'facturation');
assert.match(await runTool('nope', {}), /inconnu/);

console.log('whatsappAgent OK');
