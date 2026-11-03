import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addToLibrary, deleteStory, isVisible, listLibrary, newShareToken, purgeExpiredStories, startLibraryGrace } from '../src/library.js';

const DAY = 86400000;

function fakeEnv() {
  const kv = new Map();
  const r2 = new Map();
  return {
    kv,
    r2,
    DATA: {
      get: async (k, type) => (kv.has(k) ? (type === 'json' ? JSON.parse(kv.get(k)) : kv.get(k)) : null),
      put: async (k, v) => kv.set(k, v),
      delete: async (k) => kv.delete(k),
      list: async ({ prefix }) => ({ keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
    },
    MEDIA: { delete: async (keys) => [].concat(keys).forEach((k) => r2.delete(k)) },
  };
}

async function story(env, uid, plan, id, createdAt) {
  env.kv.set(`story:${id}`, JSON.stringify({ uid, titulo: id, parrafos: [], audio: [`audio/${id}`] }));
  env.r2.set(`img/${id}`, 1);
  env.r2.set(`audio/${id}`, 1);
  await addToLibrary(env, uid, plan, { id, titulo: id, minutes: 3, createdAt });
}

test('Estándar ve los cuentos de 30 días; el VIP, todos', () => {
  const now = Date.now();
  const old = { createdAt: now - 40 * DAY };
  assert.equal(isVisible(old, 'standard', now), false);
  assert.equal(isVisible(old, 'vip', now), true);
  assert.equal(isVisible({ createdAt: now - 2 * DAY }, 'free', now), true);
  assert.equal(isVisible({ createdAt: now - 40 * DAY, keepUntil: now + DAY }, 'pro', now), true);
});

test('la tarea diaria borra a los 30 días los cuentos de Estándar, con su imagen y su audio', async () => {
  const env = fakeEnv();
  const t0 = Date.now();
  env.kv.set('user:u1', JSON.stringify({ plan: 'standard' }));
  await story(env, 'u1', 'standard', 's1', t0);
  await purgeExpiredStories(env, t0 + 20 * DAY);
  assert.ok(env.kv.has('story:s1'));
  await purgeExpiredStories(env, t0 + 30 * DAY + 1000);
  assert.ok(!env.kv.has('story:s1'));
  assert.ok(!env.r2.has('img/s1') && !env.r2.has('audio/s1'));
  assert.deepEqual(await listLibrary(env, 'u1', 'standard'), []);
});

test('si se pasa al VIP antes de los 30 días, el cuento se queda', async () => {
  const env = fakeEnv();
  const t0 = Date.now();
  env.kv.set('user:u2', JSON.stringify({ plan: 'vip' }));
  await story(env, 'u2', 'standard', 's2', t0);
  await purgeExpiredStories(env, t0 + 31 * DAY);
  assert.ok(env.kv.has('story:s2'));
  assert.equal((await listLibrary(env, 'u2', 'vip', t0 + 31 * DAY)).length, 1);
});

test('al dejar el VIP los cuentos antiguos se conservan 30 días más', async () => {
  const env = fakeEnv();
  const t0 = Date.now() - 100 * DAY;
  await story(env, 'u3', 'vip', 'viejo', t0);
  assert.equal([...env.kv.keys()].filter((k) => k.startsWith('exp:')).length, 0, 'el VIP no programa borrados');
  const now = Date.now();
  env.kv.set('user:u3', JSON.stringify({ plan: 'standard' }));
  await startLibraryGrace(env, 'u3', now);
  assert.equal((await listLibrary(env, 'u3', 'standard', now + 10 * DAY)).length, 1);
  await purgeExpiredStories(env, now + 31 * DAY);
  assert.ok(!env.kv.has('story:viejo'));
});

test('borrar un cuento quita también su enlace compartido', async () => {
  const env = fakeEnv();
  await story(env, 'u4', 'vip', 's4', Date.now());
  const s = JSON.parse(env.kv.get('story:s4'));
  s.shareToken = 'abc';
  env.kv.set('story:s4', JSON.stringify(s));
  env.kv.set('share:abc', '{}');
  await deleteStory(env, 'otro', 's4');
  assert.ok(env.kv.has('story:s4'), 'otro usuario no puede borrarlo');
  await deleteStory(env, 'u4', 's4');
  assert.ok(!env.kv.has('story:s4') && !env.kv.has('share:abc'));
});

test('el token del enlace es largo y aleatorio', () => {
  const a = newShareToken();
  assert.match(a, /^[a-f0-9]{32}$/);
  assert.notEqual(a, newShareToken());
});
