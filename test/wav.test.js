import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectWav, mergeWav } from '../src/wav.js';
import { signPath, verifySignedPath } from '../src/sign.js';

function makeWav(samples, rate = 24000) {
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) buf.writeInt16LE(1000, 44 + i * 2);
  return new Uint8Array(buf);
}

test('mergeWav une trozos con pausa y cabecera correcta', () => {
  const out = mergeWav([makeWav(24000), makeWav(12000)], 0.25);
  const info = inspectWav(out);
  assert.equal(info.sampleRate, 24000);
  assert.equal(info.channels, 1);
  assert.equal(info.seconds, 1 + 0.5 + 0.25);
  const view = new DataView(out.buffer);
  assert.equal(view.getUint32(4, true), out.length - 8);
});

test('mergeWav rechaza formatos distintos', () => {
  assert.throws(() => mergeWav([makeWav(100, 24000), makeWav(100, 44100)]));
});

test('inspectWav rechaza lo que no es WAV', () => {
  assert.throws(() => inspectWav(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])));
});

test('URLs firmadas caducan y no se pueden falsificar', async () => {
  const now = 1_700_000_000;
  const signed = await signPath('secreto', '/media/voicesrc/abc', 600, now);
  const u = new URL(signed, 'https://x.test');
  const exp = u.searchParams.get('exp');
  const sig = u.searchParams.get('sig');
  assert.equal(await verifySignedPath('secreto', '/media/voicesrc/abc', exp, sig, now + 10), true);
  assert.equal(await verifySignedPath('secreto', '/media/voicesrc/otra', exp, sig, now + 10), false);
  assert.equal(await verifySignedPath('secreto', '/media/voicesrc/abc', exp, sig, now + 700), false);
  assert.equal(await verifySignedPath('otro', '/media/voicesrc/abc', exp, sig, now + 10), false);
  assert.equal(await verifySignedPath(undefined, '/media/voicesrc/abc', exp, sig, now + 10), false);
});
