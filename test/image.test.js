import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateImage } from '../src/ai.js';

test('con IMAGE_MODEL de Gemini pide la imagen a Gemini y devuelve sus bytes', async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const data = Buffer.from('hola').toString('base64');
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data } }] } }] }));
  };
  try {
    const img = await generateImage({ IMAGE_MODEL: 'gemini-3.1-flash-lite-image', GEMINI_API_KEY: 'k' }, 'un bosque');
    assert.match(calls[0].url, /gemini-3\.1-flash-lite-image:generateContent$/);
    assert.deepEqual(calls[0].body.generationConfig.responseModalities, ['IMAGE']);
    assert.equal(img.contentType, 'image/png');
    assert.equal(Buffer.from(img.bytes).toString(), 'hola');
  } finally {
    globalThis.fetch = original;
  }
});

test('con IMAGE_MODEL="flux" sigue usando fal.ai', async () => {
  const urls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    urls.push(url);
    if (String(url).includes('fal.run')) return new Response(JSON.stringify({ images: [{ url: 'https://x/img.jpg' }] }));
    return new Response('jpg', { headers: { 'content-type': 'image/jpeg' } });
  };
  try {
    await generateImage({ IMAGE_MODEL: 'flux', FAL_KEY: 'k', GEMINI_API_KEY: 'g' }, 'un bosque');
    assert.match(urls[0], /fal\.run/);
  } finally {
    globalThis.fetch = original;
  }
});
