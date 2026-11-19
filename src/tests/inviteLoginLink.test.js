import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import User from '../models/User.js';
import { issueInviteLoginLink, inviteLinkTtlDays } from '../services/inviteLoginLink.js';

test("le lien d'invitation ne contient que le jeton ; seule son empreinte SHA-256 est stockée, avec une échéance", async () => {
  const calls = [];
  const original = User.updateOne;
  User.updateOne = async (filter, update) => { calls.push({ filter, update }); return { acknowledged: true }; };
  process.env.AGENT_INVITE_LOGIN_URL = 'https://harx.ai/auth/signin?product=callcentre';
  try {
    const url = new URL(await issueInviteLoginLink('64b0000000000000000000a1', { product: 'callcentre' }));
    assert.equal(url.origin, 'https://harx.ai');
    assert.equal(url.pathname, '/auth/invite');
    assert.equal(url.searchParams.get('product'), 'callcentre');
    const token = url.searchParams.get('t');
    assert.equal(token.length, 43);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].update.$set['inviteLogin.tokenHash'], crypto.createHash('sha256').update(token).digest('hex'));
    assert.ok(!JSON.stringify(calls[0]).includes(token), 'le jeton en clair n’est jamais stocké');
    const days = (calls[0].update.$set['inviteLogin.expiresAt'].getTime() - Date.now()) / 86400000;
    assert.ok(days > inviteLinkTtlDays() - 0.01 && days <= inviteLinkTtlDays());
  } finally {
    User.updateOne = original;
    delete process.env.AGENT_INVITE_LOGIN_URL;
  }
});

test("sans produit demandé, l'adresse n'en porte pas ; chaque envoi crée un jeton différent", async () => {
  const original = User.updateOne;
  User.updateOne = async () => ({ acknowledged: true });
  try {
    const a = new URL(await issueInviteLoginLink('64b0000000000000000000a1'));
    const b = new URL(await issueInviteLoginLink('64b0000000000000000000a1'));
    assert.equal(a.searchParams.has('product'), false);
    assert.notEqual(a.searchParams.get('t'), b.searchParams.get('t'));
  } finally {
    User.updateOne = original;
  }
});
