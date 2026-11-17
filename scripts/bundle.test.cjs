const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('standalone browser bundle preserves the complete JSON catalog without duplicate source records', () => {
  const directory = path.join(__dirname, '../dist/data');
  const exported = JSON.parse(fs.readFileSync(path.join(directory, 'catalog.json'), 'utf8'));
  const context = {window: {}};
  vm.runInNewContext(fs.readFileSync(path.join(directory, 'catalog.js'), 'utf8'), context);
  const actual = context.window.ATLAS_DATA;
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), exported, 'the offline bundle and downloadable catalog have identical data');
  const results = new Map(actual.results.map(result => [result.id, result]));
  for (const result of actual.sourceResults) {
    assert.equal(result, results.get(result.id), 'source bounds reuse the full result record');
    assert.notEqual(result.verification, 'derived');
  }
});
