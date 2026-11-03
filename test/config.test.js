import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DURATIONS, STYLES, limitsFor, planAllows, targetWords } from '../src/config.js';

test('planAllows sigue el orden de planes', () => {
  assert.equal(planAllows('free', 'free'), true);
  assert.equal(planAllows('free', 'standard'), false);
  assert.equal(planAllows('standard', 'standard'), true);
  assert.equal(planAllows('standard', 'pro'), false);
  assert.equal(planAllows('pro', 'vip'), false);
  assert.equal(planAllows('vip', 'pro'), true);
  assert.equal(planAllows('vip', 'standard'), true);
  assert.equal(planAllows('free', 'inventado'), false);
});

test('matriz de planes', () => {
  assert.deepEqual(Object.keys(DURATIONS).filter((d) => planAllows('free', DURATIONS[d])), ['2', '3']);
  assert.equal(Object.values(STYLES).filter((s) => planAllows('standard', s.plan)).length, 4);
  assert.equal(Object.values(STYLES).filter((s) => planAllows('pro', s.plan)).length, 10);
  assert.equal(planAllows('standard', DURATIONS[10]), false);
  assert.equal(planAllows('pro', DURATIONS[10]), true);
  assert.equal(targetWords(5), 625);
});

test('topes de voz por plan', () => {
  assert.equal(limitsFor('free').voices, 0);
  assert.equal(limitsFor('standard').voices, 0);
  assert.equal(limitsFor('pro').voices, 1);
  assert.equal(limitsFor('vip').voices, 6);
  assert.equal(limitsFor('standard').narrChars, 60 * 760);
  assert.equal(limitsFor('vip').cloneChars, 120 * 760);
  assert.equal(limitsFor('inventado').voices, 0);
});
