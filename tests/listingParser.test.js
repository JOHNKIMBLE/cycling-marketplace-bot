import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeListing,
  buildMirrorThreadName,
  extractPrice,
  inferCategory,
} from '../src/listingParser.js';

test('extractPrice finds dollar amounts in titles', () => {
  assert.equal(extractPrice('Wahoo Kickr Climb - $180'), '$180');
});

test('extractPrice expands shorthand thousands', () => {
  assert.equal(extractPrice('pinarello 2022 $7k obo'), '$7,000 OBO');
});

test('extractPrice keeps or best offer qualifier', () => {
  assert.equal(extractPrice('Wahoo Kickr $180 or best offer'), '$180 OBO');
});

test('inferCategory respects ISO wording', () => {
  assert.equal(
    inferCategory({ title: 'ISO: SRAM 11 spd rim brake groupset', body: '' }),
    'ISO',
  );
});

test('analyzeListing falls back to gear when no stronger signal exists', () => {
  assert.deepEqual(
    analyzeListing({ title: 'Wahoo trainer', body: 'Barely used.' }),
    {
      category: 'Gear',
      type: 'For Sale',
      price: null,
      status: 'Active',
      summary: 'Barely used.',
    },
  );
});

test('analyzeListing detects sold status', () => {
  assert.equal(
    analyzeListing({ title: '[SOLD] Wahoo trainer', body: 'No longer available.' }).status,
    'Sold',
  );
});

test('analyzeListing does not mark historical sold wording as sold', () => {
  assert.equal(
    analyzeListing({
      title: '175mm Rival PM cranks + Rival axs front der',
      body: 'I sold them originally but the buyer did not have a compatible groupset and I got them back.',
    }).status,
    'Active',
  );
});

test('buildMirrorThreadName prefixes the team cleanly', () => {
  assert.equal(
    buildMirrorThreadName('Team Alpha', 'For Sale, 2022 Factor O2 VAM'),
    '[Team Alpha] For Sale, 2022 Factor O2 VAM',
  );
});

test('buildMirrorThreadName adds status prefix for sold items', () => {
  assert.equal(
    buildMirrorThreadName('Team Alpha', '[SOLD] Wahoo Kickr', 'Sold'),
    '[SOLD] [Team Alpha] Wahoo Kickr',
  );
});
