import assert from 'node:assert/strict';
import { normalizeFeedbackInput } from '../services/callCenterOnboardingFeedbackValidation.js';

const ok = normalizeFeedbackInput({ rating: 4, comment: '  Rapide  ', durationSeconds: 287.6 });
assert.deepEqual(ok.errors, []);
assert.deepEqual(ok.value, { rating: 4, comment: 'Rapide', durationSeconds: 288 });

assert.equal(normalizeFeedbackInput({ rating: 0 }).errors.length, 1);
assert.equal(normalizeFeedbackInput({ rating: 6 }).errors.length, 1);
assert.equal(normalizeFeedbackInput({ rating: 3.5 }).errors.length, 1);
assert.equal(normalizeFeedbackInput({}).errors.length, 1);
assert.equal(normalizeFeedbackInput({ rating: 5, comment: 'x'.repeat(3000) }).value.comment.length, 2000);
assert.equal(normalizeFeedbackInput({ rating: 5, durationSeconds: -4 }).value.durationSeconds, null);
console.log('onboardingFeedback OK');
