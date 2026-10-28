import assert from 'node:assert/strict';
import { parseProduct } from '../utils/accountProduct.js';

assert.equal(parseProduct('callcentre'), 'callcentre');
assert.equal(parseProduct(' CallCentre '), 'callcentre');
assert.equal(parseProduct('admin'), null);
assert.equal(parseProduct(''), null);
assert.equal(parseProduct(undefined), null);
assert.equal(parseProduct({ $ne: null }), null);
console.log('accountProduct OK');
