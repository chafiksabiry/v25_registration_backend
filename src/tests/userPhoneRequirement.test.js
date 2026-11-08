import test from 'node:test';
import assert from 'node:assert/strict';
import User from '../models/User.js';

const base = { email: 'rep@example.com', fullName: 'Rep', typeUser: 'rep' };

test('a rep migrated from HARX v1 can be saved without a phone', () => {
  const err = new User({ ...base, source: 'harx_v1_import' }).validateSync();
  assert.equal(err?.errors?.phone, undefined);
});

test('a regular account still needs a phone', () => {
  const err = new User({ ...base }).validateSync();
  assert.ok(err?.errors?.phone);
});
