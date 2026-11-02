import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { planFromSubscription, toForm, verifyStripeSignature } from '../src/stripe.js';

test('toForm codifica objetos anidados como Stripe', () => {
  const form = toForm({ mode: 'subscription', line_items: { 0: { price: 'p_1', quantity: 1 } }, skip: undefined });
  assert.equal(form.toString(), 'mode=subscription&line_items%5B0%5D%5Bprice%5D=p_1&line_items%5B0%5D%5Bquantity%5D=1');
});

test('verifyStripeSignature acepta firmas válidas y rechaza las malas', async () => {
  const secret = 'whsec_test';
  const payload = '{"id":"evt_1"}';
  const t = 1_700_000_000;
  const sig = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  assert.equal(await verifyStripeSignature(payload, `t=${t},v1=${sig}`, secret, 300, t + 10), true);
  assert.equal(await verifyStripeSignature(payload + 'x', `t=${t},v1=${sig}`, secret, 300, t + 10), false);
  assert.equal(await verifyStripeSignature(payload, `t=${t},v1=${sig}`, secret, 300, t + 1000), false);
  assert.equal(await verifyStripeSignature(payload, null, secret), false);
});

test('planFromSubscription', () => {
  assert.equal(planFromSubscription({ status: 'trialing', metadata: { plan: 'vip' } }), 'vip');
  assert.equal(planFromSubscription({ status: 'active', metadata: {} }), 'standard');
  assert.equal(planFromSubscription({ status: 'canceled', metadata: { plan: 'vip' } }), 'free');
});
