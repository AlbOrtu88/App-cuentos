import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DURATIONS, STYLES, planAllows, targetWords } from '../src/config.js';

test('planAllows sigue el orden de planes', () => {
  assert.equal(planAllows('free', 'free'), true);
  assert.equal(planAllows('free', 'standard'), false);
  assert.equal(planAllows('standard', 'standard'), true);
  assert.equal(planAllows('standard', 'vip'), false);
  assert.equal(planAllows('vip', 'standard'), true);
  assert.equal(planAllows('free', 'inventado'), false);
});

test('matriz de planes', () => {
  assert.deepEqual(Object.keys(DURATIONS).filter((d) => planAllows('free', DURATIONS[d])), ['2', '3']);
  assert.equal(Object.values(STYLES).filter((s) => planAllows('standard', s.plan)).length, 4);
  assert.equal(Object.values(STYLES).filter((s) => planAllows('vip', s.plan)).length, 10);
  assert.equal(targetWords(5), 625);
});
