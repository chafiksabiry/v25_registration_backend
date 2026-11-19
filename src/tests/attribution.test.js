import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeAttribution } from '../utils/attribution.js';

test("seuls les cinq paramètres utm_ valides sont gardés", () => {
  assert.deepEqual(
    sanitizeAttribution({ utm_source: 'linkedin', utm_medium: 'organic_social', utm_campaign: 'lot-1', utm_content: 'post_12', utm_term: 'nomad', role: 'admin', __proto__: { x: 1 } }),
    { utm_source: 'linkedin', utm_medium: 'organic_social', utm_campaign: 'lot-1', utm_content: 'post_12', utm_term: 'nomad' },
  );
});

test('valeurs vides, trop longues, non textuelles ou avec des caractères inattendus : ignorées', () => {
  assert.equal(sanitizeAttribution({ utm_source: '', utm_medium: '<script>', utm_campaign: 'a'.repeat(101), utm_content: 5, utm_term: { $ne: 1 } }), null);
});

test('corps absent ou de mauvais type : null', () => {
  assert.equal(sanitizeAttribution(undefined), null);
  assert.equal(sanitizeAttribution('utm_source=x'), null);
  assert.equal(sanitizeAttribution(['linkedin']), null);
});
