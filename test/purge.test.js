import { test } from 'node:test';
import assert from 'node:assert/strict';
import { purgeExpiredVoices, scheduleVoicePurge } from '../src/index.js';

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
    MEDIA: {
      delete: async (keys) => [].concat(keys).forEach((k) => r2.delete(k)),
      list: async ({ prefix }) => ({ objects: [...r2.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false }),
    },
  };
}

test('al dejar el VIP las voces se borran a los 30 días, no antes', async () => {
  const env = fakeEnv();
  const user = { plan: 'free', voices: [{ id: 'v1', name: 'Papá' }] };
  env.r2.set('voicesrc/v1', 1);
  env.r2.set('audio/v1/s1', 1);
  env.r2.set('audio/s1', 1);
  await scheduleVoicePurge(env, 'u1', user);
  env.kv.set('user:u1', JSON.stringify(user));
  assert.ok(user.voicesPurgeAt > Date.now());

  await purgeExpiredVoices(env, Date.now() + 29 * 86400000);
  assert.ok(env.r2.has('voicesrc/v1'));

  await purgeExpiredVoices(env, Date.now() + 31 * 86400000);
  assert.ok(!env.r2.has('voicesrc/v1'));
  assert.ok(!env.r2.has('audio/v1/s1'));
  assert.ok(env.r2.has('audio/s1'), 'el audio del narrador no se toca');
  assert.deepEqual(JSON.parse(env.kv.get('user:u1')).voices, []);
  assert.ok(!env.kv.has('voicepurge:u1'));
});

test('si vuelve al VIP antes de 30 días no se borra nada', async () => {
  const env = fakeEnv();
  const user = { plan: 'standard', voices: [{ id: 'v1', name: 'Mamá' }] };
  env.r2.set('voicesrc/v1', 1);
  await scheduleVoicePurge(env, 'u2', user);
  user.plan = 'vip';
  await scheduleVoicePurge(env, 'u2', user);
  env.kv.set('user:u2', JSON.stringify(user));
  await purgeExpiredVoices(env, Date.now() + 31 * 86400000);
  assert.ok(env.r2.has('voicesrc/v1'));
  assert.equal(user.voicesPurgeAt, undefined);
});
