/**
 * Cuentos Mágicos: Worker de Cloudflare.
 * Sirve la PWA (carpeta public/) y la API. Guarda el plan y la cuota en KV,
 * las imágenes y audios en R2, y cobra con Stripe.
 */

import { DURATIONS, FREE_STORY_LIMIT, LESSONS, MAX_VOICES, PAID_PLANS, STYLES, limitsFor, planAllows, targetWords } from './config.js';
import { cleanAge, cleanField, monthKey, stripNames } from './text.js';
import { generateImage, generateStoryText, synthesizeClonedSpeech, synthesizeSpeech } from './ai.js';
import { signPath, verifySignedPath } from './sign.js';
import { inspectWav } from './wav.js';
import { planFromSubscription, stripeRequest, verifyStripeSignature } from './stripe.js';
import {
  addToLibrary, deleteStory, findEntry, keepsForever, listLibrary, newShareToken, purgeExpiredStories, startLibraryGrace,
} from './library.js';

const COOKIE = 'cm_uid';

export { purgeExpiredVoices, scheduleVoicePurge };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/stripe-webhook' && request.method === 'POST') {
        return await handleStripeWebhook(request, env);
      }

      if (path.startsWith('/media/voicesrc/') && request.method === 'GET') {
        return await serveVoiceSample(env, url);
      }

      // Enlace para los abuelos: página pública y sus datos (sin cookie de sesión).
      if (/^\/c\/[a-f0-9]{32}$/.test(path) && request.method === 'GET') {
        return env.ASSETS.fetch(new Request(new URL('/escuchar', url), request));
      }
      const sharedMatch = path.match(/^\/api\/shared\/([a-f0-9]{32})$/);
      if (sharedMatch && request.method === 'GET') return await handleShared(env, sharedMatch[1]);

      if (path.startsWith('/media/') && request.method === 'GET') {
        return await serveMedia(env, path.slice('/media/'.length));
      }

      if (path.startsWith('/api/')) {
        if (request.method !== 'GET' && !originAllowed(request, url, env)) {
          return json({ error: 'Origen no permitido' }, 403);
        }
        const session = await getSession(request, env);
        const res = await routeApi(request, env, url, session);
        if (session.isNew) res.headers.append('Set-Cookie', sessionCookie(session.uid, url));
        return res;
      }

      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error('[ERROR]', path, err.message);
      return json({ error: 'Error interno del servidor' }, 500);
    }
  },

  // Tarea diaria (cron en wrangler.toml): borra las voces 30 días después de dejar el plan
  // y los cuentos que ya no entran en la biblioteca del plan.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(Promise.all([purgeExpiredVoices(env), purgeExpiredStories(env)]));
  },
};

async function routeApi(request, env, url, session) {
  const { path, method } = { path: url.pathname, method: request.method };
  if (path === '/api/me' && method === 'GET') return handleMe(env, session);
  if (path === '/api/generate-story' && method === 'POST') return handleGenerate(request, env, url, session);
  const audioMatch = path.match(/^\/api\/story\/([a-z0-9-]+)\/audio$/);
  if (audioMatch && method === 'POST') return handleAudio(request, env, url, session, audioMatch[1]);
  if (path === '/api/stories' && method === 'GET') {
    return json({ stories: await listLibrary(env, session.uid, session.user.plan), forever: keepsForever(session.user.plan) });
  }
  const storyMatch = path.match(/^\/api\/story\/([a-f0-9-]{36})$/);
  if (storyMatch && method === 'GET') return handleGetStory(env, session, storyMatch[1]);
  if (storyMatch && method === 'DELETE') return handleDeleteStory(env, session, storyMatch[1]);
  const shareMatch = path.match(/^\/api\/story\/([a-f0-9-]{36})\/share$/);
  if (shareMatch && method === 'POST') return handleShare(request, env, url, session, shareMatch[1]);
  if (shareMatch && method === 'DELETE') return handleUnshare(env, session, shareMatch[1]);
  if (path === '/api/voices' && method === 'GET') return json({ voices: publicVoices(session.user), max: limitsFor(session.user.plan).voices });
  if (path === '/api/voices' && method === 'POST') return handleAddVoice(request, env, url, session);
  const voiceMatch = path.match(/^\/api\/voices\/([a-f0-9-]{36})$/);
  if (voiceMatch && method === 'DELETE') return handleDeleteVoice(env, session, voiceMatch[1]);
  if (path === '/api/checkout' && method === 'POST') return handleCheckout(request, env, url, session);
  if (path === '/api/portal' && method === 'POST') return handlePortal(env, url, session);
  return json({ error: 'Ruta no encontrada' }, 404);
}

// ---------- Sesión anónima ----------

async function getSession(request, env) {
  const cookies = Object.fromEntries(
    (request.headers.get('Cookie') || '')
      .split(';')
      .map((c) => c.trim().split('='))
      .filter(([k]) => k),
  );
  let uid = cookies[COOKIE];
  let isNew = false;
  if (!uid || !/^[a-f0-9-]{36}$/.test(uid)) {
    uid = crypto.randomUUID();
    isNew = true;
  }
  const user = (await env.DATA.get(`user:${uid}`, 'json')) || { plan: 'free', freeUsed: 0 };
  // Solo para probar en local: fuerza un plan sin pasar por Stripe.
  if (env.DEV_PLAN && env.ENVIRONMENT !== 'production') user.plan = env.DEV_PLAN;
  return { uid, isNew, user };
}

function sessionCookie(uid, url) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${uid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 400}${secure}`;
}

async function saveUser(env, uid, user) {
  await env.DATA.put(`user:${uid}`, JSON.stringify(user));
}

function originAllowed(request, url, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  if (origin === url.origin) return true;
  return Boolean(env.ALLOWED_ORIGIN) && origin === env.ALLOWED_ORIGIN;
}

// ---------- /api/me ----------

function handleMe(env, session) {
  const { plan, freeUsed = 0 } = session.user;
  return json({
    plan,
    freeRemaining: plan === 'free' ? Math.max(0, FREE_STORY_LIMIT - freeUsed) : null,
    hasBilling: Boolean(session.user.customerId),
    hadTrial: Boolean(session.user.hadTrial),
    voicePlansEnabled: env.VOICE_PLANS_ENABLED === '1',
    voices: publicVoices(session.user),
    maxVoices: limitsFor(plan).voices,
  });
}

// ---------- /api/generate-story ----------

async function handleGenerate(request, env, url, session) {
  const { uid, user } = session;
  const body = await request.json().catch(() => ({}));

  const duration = parseInt(body.duration, 10);
  const style = STYLES[body.styleId];
  const lesson = LESSONS[body.lessonId];
  if (!DURATIONS[duration]) return json({ error: 'Duración no válida' }, 400);
  if (!style) return json({ error: 'Estilo no válido' }, 400);
  if (!lesson) return json({ error: 'Moraleja no válida' }, 400);

  if (!planAllows(user.plan, DURATIONS[duration]) || !planAllows(user.plan, style.plan)) {
    // Si hace falta más que el Estándar se ofrece directamente el VIP.
    const needed = planAllows('standard', DURATIONS[duration]) && planAllows('standard', style.plan) ? 'standard' : 'vip';
    return json({ error: 'Esta opción requiere un plan superior.', code: 'upgrade', needed }, 402);
  }

  if (user.plan === 'free' && (user.freeUsed || 0) >= FREE_STORY_LIMIT) {
    return json({ error: 'Has usado tus cuentos gratis.', code: 'quota' }, 402);
  }

  const limited = await hitDailyLimit(request, env, uid, user.plan);
  if (limited) return json({ error: 'Ya habéis creado los 5 cuentos de hoy. Mañana podréis crear más.', code: 'daily' }, 429);

  const input = {
    name: cleanField(body.childName, 'el pequeño'),
    age: cleanAge(body.childAge),
    companion: cleanField(body.companion, 'un amigo'),
    petToy: cleanField(body.petToy, 'su peluche preferido'),
    lesson,
    words: targetWords(duration),
  };

  const t0 = Date.now();
  const story = await generateStoryText(env, input);
  console.log(`[GEMINI] ${Date.now() - t0}ms | plan ${user.plan} | ${duration} min`);

  const id = crypto.randomUUID();
  const scene = stripNames(String(story.escena || 'a cozy bedtime scene'), [input.name, input.companion, input.petToy]);
  const imagePrompt = `${scene}, ${style.prompt}, dreamy cozy bedtime atmosphere, cute, child friendly, no text`;

  let imageUrl = null;
  try {
    const image = await generateImage(env, imagePrompt);
    if (image) {
      await env.MEDIA.put(`img/${id}`, image.bytes, { httpMetadata: { contentType: image.contentType } });
      imageUrl = `/media/img/${id}`;
    }
  } catch (err) {
    console.error('[IMAGEN]', err.message);
  }

  const createdAt = Date.now();
  await env.DATA.put(
    `story:${id}`,
    JSON.stringify({ uid, titulo: story.titulo, parrafos: story.parrafos, imageUrl, minutes: duration, createdAt, audio: [] }),
  );
  await addToLibrary(env, uid, user.plan, { id, titulo: story.titulo, minutes: duration, imageUrl, child: input.name, createdAt });

  if (user.plan === 'free') {
    user.freeUsed = (user.freeUsed || 0) + 1;
    await saveUser(env, uid, user);
  }

  return json({
    id,
    titulo: story.titulo,
    parrafos: story.parrafos,
    imageUrl,
    minutes: duration,
    createdAt,
    audio: {},
    freeRemaining: user.plan === 'free' ? Math.max(0, FREE_STORY_LIMIT - user.freeUsed) : null,
  });
}

// Límite diario anti-abuso: por IP para el plan gratis y por usuario para los de pago.
async function hitDailyLimit(request, env, uid, plan) {
  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const key = plan === 'free' ? `rl:ip:${ip}:${day}` : `rl:uid:${uid}:${day}`;
  const max = parseInt(plan === 'free' ? env.FREE_DAILY_IP_LIMIT || '10' : env.PAID_DAILY_LIMIT || '5', 10);
  const count = parseInt((await env.DATA.get(key)) || '0', 10);
  if (count >= max) return true;
  await env.DATA.put(key, String(count + 1), { expirationTtl: 60 * 60 * 26 });
  return false;
}

// ---------- /api/story/:id/audio ----------
// Sin voiceId: narrador con voz natural de Google (planes de pago).
// Con voiceId: voz clonada de un familiar con Chatterbox (planes Pro y VIP).

async function handleAudio(request, env, url, session, id) {
  const { uid, user } = session;
  if (user.plan === 'free') {
    return json({ error: 'La voz narrada está incluida en los planes de pago.', code: 'upgrade', needed: 'standard' }, 402);
  }
  const body = await request.json().catch(() => ({}));
  const voice = body.voiceId ? (user.voices || []).find((v) => v.id === body.voiceId) : null;
  if (body.voiceId && !voice) return json({ error: 'Voz no encontrada' }, 404);
  const limits = limitsFor(user.plan);
  if (voice && !usableVoices(user).some((v) => v.id === voice.id)) {
    return json({ error: 'Con tu plan no puedes usar esta voz. Con el VIP tienes hasta 6 voces.', code: 'upgrade', needed: 'vip' }, 402);
  }

  const story = await env.DATA.get(`story:${id}`, 'json');
  if (!story || story.uid !== uid || !(await findEntry(env, uid, user.plan, id))) {
    return json({ error: 'Cuento no encontrado' }, 404);
  }

  const key = voice ? `audio/${voice.id}/${id}` : `audio/${id}`;
  // Si el audio ya existe se reutiliza: repetir un cuento no cuesta nada.
  if (await env.MEDIA.head(key)) return json({ audioUrl: `/media/${key}` });

  const text = `${story.titulo}. ${story.parrafos.join(' ')}`;

  // Uso razonable: topes mensuales de caracteres por usuario (uno para cada tipo de voz).
  const month = monthKey();
  if (user.audioMonth !== month) {
    user.audioMonth = month;
    user.audioChars = 0;
    user.clonedChars = 0;
  }
  const counter = voice ? 'clonedChars' : 'audioChars';
  const cap = voice ? limits.cloneChars : limits.narrChars;
  const total = (user.audioChars || 0) + (user.clonedChars || 0) + text.length;
  if ((user[counter] || 0) + text.length > cap || (limits.totalChars && total > limits.totalChars)) {
    const error = voice
      ? 'Has llegado a los minutos de voz familiar de este mes. Puedes seguir con el narrador.'
      : 'Has llegado al uso razonable de voz de este mes.';
    return json({ error, code: 'audio_cap' }, 429);
  }

  let bytes;
  let contentType;
  if (voice) {
    if (env.MOCK_AI === '1' || !env.FAL_KEY || !env.MEDIA_SIGNING_KEY) {
      return json({ error: 'Voz familiar no configurada', code: 'no_tts' }, 503);
    }
    const sampleUrl = url.origin + (await signPath(env.MEDIA_SIGNING_KEY, `/media/voicesrc/${voice.id}`, 900));
    const t0 = Date.now();
    bytes = await synthesizeClonedSpeech(env, text, sampleUrl);
    console.log(`[CHATTERBOX] ${Date.now() - t0}ms | ${text.length} caracteres`);
    contentType = 'audio/wav';
  } else {
    if (env.MOCK_AI === '1' || !env.GOOGLE_TTS_API_KEY) {
      return json({ error: 'Voz no configurada', code: 'no_tts' }, 503);
    }
    bytes = await synthesizeSpeech(env, text);
    contentType = 'audio/mpeg';
  }

  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType } });
  user[counter] = (user[counter] || 0) + text.length;
  await saveUser(env, uid, user);
  story.audio = [...new Set([...(story.audio || []), key])];
  await env.DATA.put(`story:${id}`, JSON.stringify(story));
  return json({ audioUrl: `/media/${key}` });
}

// ---------- Biblioteca ----------

// Audios ya narrados que se pueden reproducir: { '': narrador, voiceId: voz de la familia }.
// Los de voces borradas o que el plan ya no cubre no se devuelven.
function audioMap(story, id, user) {
  const voices = new Set(usableVoices(user).map((v) => v.id));
  const map = {};
  for (const key of story.audio || []) {
    if (key === `audio/${id}`) map[''] = `/media/${key}`;
    else if (voices.has(key.split('/')[1])) map[key.split('/')[1]] = `/media/${key}`;
  }
  return map;
}

async function handleGetStory(env, session, id) {
  const { uid, user } = session;
  const entry = await findEntry(env, uid, user.plan, id);
  const story = entry && (await env.DATA.get(`story:${id}`, 'json'));
  if (!story || story.uid !== uid) return json({ error: 'Este cuento ya no está en tu biblioteca.' }, 404);
  return json({
    id,
    titulo: story.titulo,
    parrafos: story.parrafos,
    imageUrl: story.imageUrl,
    minutes: story.minutes,
    createdAt: entry.createdAt,
    audio: audioMap(story, id, user),
    shared: Boolean(story.shareToken),
  });
}

async function handleDeleteStory(env, session, id) {
  await deleteStory(env, session.uid, id);
  return json({ ok: true });
}

// ---------- Enlace para los abuelos (VIP) ----------

async function handleShare(request, env, url, session, id) {
  const { uid, user } = session;
  if (!keepsForever(user.plan)) {
    return json({ error: 'El enlace para los abuelos está en el plan VIP.', code: 'upgrade', needed: 'vip' }, 402);
  }
  const story = await env.DATA.get(`story:${id}`, 'json');
  if (!story || story.uid !== uid) return json({ error: 'Cuento no encontrado' }, 404);
  const body = await request.json().catch(() => ({}));
  const audioKey = body.voiceId ? `audio/${body.voiceId}/${id}` : `audio/${id}`;
  if (!(story.audio || []).includes(audioKey)) {
    return json({ error: 'Escucha el cuento con esa voz antes de compartirlo.', code: 'no_audio' }, 400);
  }
  const token = story.shareToken || newShareToken();
  await env.DATA.put(`share:${token}`, JSON.stringify({ uid, storyId: id, audioKey, createdAt: Date.now() }));
  if (story.shareToken !== token) {
    story.shareToken = token;
    await env.DATA.put(`story:${id}`, JSON.stringify(story));
  }
  return json({ url: `${url.origin}/c/${token}` });
}

async function handleUnshare(env, session, id) {
  const story = await env.DATA.get(`story:${id}`, 'json');
  if (!story || story.uid !== session.uid) return json({ error: 'Cuento no encontrado' }, 404);
  if (story.shareToken) {
    await env.DATA.delete(`share:${story.shareToken}`);
    delete story.shareToken;
    await env.DATA.put(`story:${id}`, JSON.stringify(story));
  }
  return json({ ok: true });
}

// Lo que ve quien abre el enlace: el cuento y su audio, nada más.
async function handleShared(env, token) {
  const share = await env.DATA.get(`share:${token}`, 'json');
  const gone = () => json({ error: 'Este enlace ya no está activo.' }, 404);
  if (!share) return gone();
  const [owner, story] = await Promise.all([
    env.DATA.get(`user:${share.uid}`, 'json'),
    env.DATA.get(`story:${share.storyId}`, 'json'),
  ]);
  if (owner && env.DEV_PLAN && env.ENVIRONMENT !== 'production') owner.plan = env.DEV_PLAN;
  // El enlace solo funciona mientras la familia siga en el VIP.
  if (!story || !owner || story.uid !== share.uid || !keepsForever(owner.plan)) return gone();
  const audio = audioMap(story, share.storyId, owner);
  const voiceId = share.audioKey === `audio/${share.storyId}` ? '' : share.audioKey.split('/')[1];
  return json({
    titulo: story.titulo,
    parrafos: story.parrafos,
    imageUrl: story.imageUrl,
    minutes: story.minutes,
    audioUrl: audio[voiceId] || null,
  });
}

// ---------- Voces de la familia (VIP) ----------

// Las voces que el plan permite usar: las más antiguas, hasta el máximo del plan.
function usableVoices(user) {
  return (user.voices || []).slice(0, limitsFor(user.plan).voices);
}

function publicVoices(user) {
  const usable = new Set(usableVoices(user).map((v) => v.id));
  return (user.voices || []).map(({ id, name }) => ({ id, name, usable: usable.has(id) }));
}

const MAX_SAMPLE_BYTES = 3 * 1024 * 1024;

async function handleAddVoice(request, env, url, session) {
  const { uid, user } = session;
  const allowed = limitsFor(user.plan).voices;
  if (allowed === 0) {
    return json({ error: 'Las voces de la familia están en los planes Pro y VIP.', code: 'upgrade', needed: 'vip' }, 402);
  }
  // Consentimiento expreso: la voz es un dato biométrico.
  if (url.searchParams.get('consent') !== '1') {
    return json({ error: 'Falta el consentimiento de la persona que graba.' }, 400);
  }
  const voices = user.voices || [];
  if (voices.length >= allowed) {
    const error = allowed < MAX_VOICES
      ? `Tu plan permite ${allowed} voz. Con el VIP puedes guardar hasta ${MAX_VOICES}.`
      : `Puedes guardar hasta ${MAX_VOICES} voces. Borra una para añadir otra.`;
    return json({ error, code: allowed < MAX_VOICES ? 'upgrade' : 'max_voices', needed: 'vip' }, allowed < MAX_VOICES ? 402 : 400);
  }
  const name = cleanField(url.searchParams.get('name') || '', '', 20);
  const speaker = cleanField(url.searchParams.get('speaker') || '', '', 40);
  const relation = cleanField(url.searchParams.get('relation') || '', '', 20);
  if (!name) return json({ error: 'Ponle un nombre a la voz (por ejemplo, Papá).' }, 400);
  if (!speaker || !relation) return json({ error: 'Falta el nombre de quien graba o su relación con el niño.' }, 400);

  const declared = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (declared > MAX_SAMPLE_BYTES) return json({ error: 'La grabación es demasiado larga.' }, 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_SAMPLE_BYTES) return json({ error: 'La grabación es demasiado larga.' }, 413);

  let info;
  try {
    info = inspectWav(bytes);
  } catch {
    return json({ error: 'El audio no es válido. Vuelve a grabarlo.' }, 400);
  }
  if (info.seconds < 8) return json({ error: 'Graba al menos 10 segundos para que la voz se parezca.' }, 400);
  if (info.seconds > 45) return json({ error: 'Graba como mucho 40 segundos.' }, 400);

  const id = crypto.randomUUID();
  await env.MEDIA.put(`voicesrc/${id}`, bytes, { httpMetadata: { contentType: 'audio/wav' } });
  // La grabación empieza con la frase de consentimiento, así que la propia muestra sirve de prueba.
  const now = new Date().toISOString();
  voices.push({ id, name, speaker, relation, createdAt: now, consentAt: now });
  user.voices = voices;
  await saveUser(env, uid, user);
  return json({ voices: publicVoices(user) });
}

async function handleDeleteVoice(env, session, voiceId) {
  const { uid, user } = session;
  const voices = user.voices || [];
  if (!voices.some((v) => v.id === voiceId)) return json({ error: 'Voz no encontrada' }, 404);
  await deleteVoiceFiles(env, voiceId);
  user.voices = voices.filter((v) => v.id !== voiceId);
  await saveUser(env, uid, user);
  return json({ voices: publicVoices(user) });
}

// Borra la muestra de voz y los cuentos ya narrados con ella.
async function deleteVoiceFiles(env, voiceId) {
  await env.MEDIA.delete(`voicesrc/${voiceId}`);
  let cursor;
  do {
    const page = await env.MEDIA.list({ prefix: `audio/${voiceId}/`, cursor });
    if (page.objects.length) await env.MEDIA.delete(page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

const VOICE_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

// Si el plan ya no permite todas las voces guardadas (cancelación o bajada de plan),
// las que sobran se borran a los 30 días; si vuelve a un plan que las cubre, se cancela.
async function scheduleVoicePurge(env, uid, user) {
  if ((user.voices || []).length <= limitsFor(user.plan).voices) {
    if (user.voicesPurgeAt) {
      delete user.voicesPurgeAt;
      await env.DATA.delete(`voicepurge:${uid}`);
    }
    return;
  }
  if (!user.voices?.length || user.voicesPurgeAt) return;
  user.voicesPurgeAt = Date.now() + VOICE_GRACE_MS;
  await env.DATA.put(`voicepurge:${uid}`, String(user.voicesPurgeAt));
}

async function purgeExpiredVoices(env, now = Date.now()) {
  let cursor;
  do {
    const page = await env.DATA.list({ prefix: 'voicepurge:', cursor });
    for (const { name } of page.keys) {
      const due = parseInt((await env.DATA.get(name)) || '0', 10);
      if (due > now) continue;
      const uid = name.slice('voicepurge:'.length);
      const user = await env.DATA.get(`user:${uid}`, 'json');
      const keep = user ? limitsFor(user.plan).voices : 0;
      if (user && (user.voices || []).length > keep) {
        for (const v of user.voices.slice(keep)) await deleteVoiceFiles(env, v.id);
        user.voices = user.voices.slice(0, keep);
        delete user.voicesPurgeAt;
        await saveUser(env, uid, user);
        console.log(`[VOCES] borradas las voces de ${uid}`);
      }
      await env.DATA.delete(name);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}

// La muestra de voz solo se sirve con una URL firmada y que caduca (para fal.ai).
async function serveVoiceSample(env, url) {
  const ok = await verifySignedPath(env.MEDIA_SIGNING_KEY, url.pathname, url.searchParams.get('exp'), url.searchParams.get('sig'));
  const match = url.pathname.match(/^\/media\/voicesrc\/([a-f0-9-]{36})$/);
  if (!ok || !match) return new Response('No autorizado', { status: 403 });
  const obj = await env.MEDIA.get(`voicesrc/${match[1]}`);
  if (!obj) return new Response('No encontrado', { status: 404 });
  return new Response(obj.body, { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' } });
}

// ---------- /media/* ----------

async function serveMedia(env, key) {
  if (!/^(img\/[a-f0-9-]+|audio\/[a-f0-9-]+(\/[a-f0-9-]+)?)$/.test(key)) return new Response('No encontrado', { status: 404 });
  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response('No encontrado', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'private, max-age=31536000, immutable');
  return new Response(obj.body, { headers });
}

// ---------- Stripe ----------

const PRICE_ENV = {
  standard: { monthly: 'PRICE_STANDARD_MONTHLY', annual: 'PRICE_STANDARD_ANNUAL' },
  pro: { monthly: 'PRICE_PRO_MONTHLY', annual: 'PRICE_PRO_ANNUAL' },
  vip: { monthly: 'PRICE_VIP_MONTHLY', annual: 'PRICE_VIP_ANNUAL' },
};

async function handleCheckout(request, env, url, session) {
  const body = await request.json().catch(() => ({}));
  const plan = PAID_PLANS.includes(body.plan) ? body.plan : 'standard';
  const billing = body.billing === 'monthly' ? 'monthly' : 'annual';
  if (plan !== 'standard' && env.VOICE_PLANS_ENABLED !== '1') {
    return json({ error: 'Los planes Pro y VIP llegarán pronto.' }, 400);
  }
  // Consentimiento expreso para empezar ya y perder el desistimiento (art. 103.m TRLGDCU).
  if (body.acceptedImmediateStart !== true) {
    return json({ error: 'Marca la casilla para empezar a usar el servicio.' }, 400);
  }
  const acceptedAt = new Date().toISOString();
  const price = env[PRICE_ENV[plan][billing]];
  if (!env.STRIPE_SECRET_KEY || !price) return json({ error: 'Pagos no configurados' }, 503);

  const checkout = await stripeRequest(env, '/checkout/sessions', {
    mode: 'subscription',
    line_items: { 0: { price, quantity: 1 } },
    client_reference_id: session.uid,
    customer: session.user.customerId || undefined,
    metadata: { uid: session.uid, plan, immediate_start_accepted_at: acceptedAt },
    subscription_data: {
      // La prueba gratis es solo del VIP, para que la familia escuche sus propias voces.
      trial_period_days: plan === 'vip' && !session.user.hadTrial ? 3 : undefined,
      metadata: { uid: session.uid, plan, immediate_start_accepted_at: acceptedAt },
    },
    allow_promotion_codes: 'true',
    locale: 'es',
    success_url: `${url.origin}/?checkout=ok`,
    cancel_url: `${url.origin}/?checkout=cancel`,
  });
  return json({ url: checkout.url });
}

async function handlePortal(env, url, session) {
  if (!session.user.customerId) return json({ error: 'No hay suscripción' }, 400);
  const portal = await stripeRequest(env, '/billing_portal/sessions', {
    customer: session.user.customerId,
    return_url: `${url.origin}/`,
  });
  return json({ url: portal.url });
}

async function handleStripeWebhook(request, env) {
  const payload = await request.text();
  const ok = await verifyStripeSignature(payload, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return json({ error: 'Firma no válida' }, 400);

  const event = JSON.parse(payload);
  const obj = event.data?.object || {};

  if (event.type === 'checkout.session.completed') {
    const uid = obj.client_reference_id || obj.metadata?.uid;
    if (uid) {
      const user = (await env.DATA.get(`user:${uid}`, 'json')) || { plan: 'free', freeUsed: 0 };
      const before = user.plan;
      user.plan = ['pro', 'vip'].includes(obj.metadata?.plan) ? obj.metadata.plan : 'standard';
      if (keepsForever(before) && !keepsForever(user.plan)) await startLibraryGrace(env, uid);
      user.customerId = obj.customer;
      user.subscriptionId = obj.subscription;
      if (user.plan === 'vip') user.hadTrial = true;
      await scheduleVoicePurge(env, uid, user);
      await saveUser(env, uid, user);
    }
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const uid = obj.metadata?.uid;
    if (uid) {
      const user = (await env.DATA.get(`user:${uid}`, 'json')) || { plan: 'free', freeUsed: 0 };
      const before = user.plan;
      user.plan = event.type === 'customer.subscription.deleted' ? 'free' : planFromSubscription(obj);
      if (keepsForever(before) && !keepsForever(user.plan)) await startLibraryGrace(env, uid);
      user.customerId = obj.customer;
      user.subscriptionId = obj.id;
      await scheduleVoicePurge(env, uid, user);
      await saveUser(env, uid, user);
    }
  }

  return json({ received: true });
}

// ---------- utilidades ----------

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
