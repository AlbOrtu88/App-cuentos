// Biblioteca de cuentos: volver a leer y escuchar sin gastar en IA.
// Todos los planes guardan los cuentos de los últimos 30 días; el VIP los guarda para siempre.
//
// KV:
//   lib:{uid}            índice del usuario: [{ id, titulo, minutes, imageUrl, child, createdAt, keepUntil? }]
//   story:{id}           el cuento completo (sin caducidad: la borra la tarea diaria)
//   exp:{AAAA-MM-DD}:{id} → uid   cuándo revisar si hay que borrar un cuento
//   share:{token}        enlace para los abuelos (solo VIP)

export const LIBRARY_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = LIBRARY_DAYS * DAY_MS;

export function keepsForever(plan) {
  return plan === 'vip';
}

function dayKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// Un cuento se ve si el plan lo guarda para siempre, si tiene menos de 30 días
// o si está en el periodo de gracia de 30 días tras dejar el VIP.
export function isVisible(entry, plan, now = Date.now()) {
  if (keepsForever(plan)) return true;
  if (now - entry.createdAt < RETENTION_MS) return true;
  return Boolean(entry.keepUntil && entry.keepUntil > now);
}

export async function getIndex(env, uid) {
  return (await env.DATA.get(`lib:${uid}`, 'json')) || [];
}

async function saveIndex(env, uid, index) {
  await env.DATA.put(`lib:${uid}`, JSON.stringify(index));
}

export async function addToLibrary(env, uid, plan, entry) {
  const index = await getIndex(env, uid);
  index.unshift(entry);
  await saveIndex(env, uid, index);
  if (!keepsForever(plan)) {
    await env.DATA.put(`exp:${dayKey(entry.createdAt + RETENTION_MS)}:${entry.id}`, uid);
  }
}

export async function listLibrary(env, uid, plan, now = Date.now()) {
  return (await getIndex(env, uid)).filter((e) => isVisible(e, plan, now));
}

export async function findEntry(env, uid, plan, id, now = Date.now()) {
  const entry = (await getIndex(env, uid)).find((e) => e.id === id);
  return entry && isVisible(entry, plan, now) ? entry : null;
}

// Borra el cuento, su ilustración, sus audios y su enlace compartido.
export async function deleteStory(env, uid, id) {
  const story = await env.DATA.get(`story:${id}`, 'json');
  if (story && story.uid === uid) {
    const keys = [`img/${id}`, `audio/${id}`, ...(story.audio || [])];
    await env.MEDIA.delete([...new Set(keys)]);
    if (story.shareToken) await env.DATA.delete(`share:${story.shareToken}`);
    await env.DATA.delete(`story:${id}`);
  }
  const index = await getIndex(env, uid);
  const rest = index.filter((e) => e.id !== id);
  if (rest.length !== index.length) await saveIndex(env, uid, rest);
}

// Al dejar el VIP, los cuentos antiguos se conservan 30 días más y después se borran.
export async function startLibraryGrace(env, uid, now = Date.now()) {
  const index = await getIndex(env, uid);
  const keepUntil = now + RETENTION_MS;
  let changed = false;
  for (const entry of index) {
    if (now - entry.createdAt < RETENTION_MS) continue; // ya tiene su revisión a los 30 días
    entry.keepUntil = keepUntil;
    changed = true;
    await env.DATA.put(`exp:${dayKey(keepUntil)}:${entry.id}`, uid);
  }
  if (changed) await saveIndex(env, uid, index);
}

// Tarea diaria: borra los cuentos que ya no entran en el plan. Revisa los últimos 7 días
// por si algún día la tarea no se ejecutó.
export async function purgeExpiredStories(env, now = Date.now()) {
  for (let d = 7; d >= 0; d--) {
    const prefix = `exp:${dayKey(now - d * DAY_MS)}:`;
    let cursor;
    do {
      const page = await env.DATA.list({ prefix, cursor });
      for (const { name } of page.keys) {
        const uid = await env.DATA.get(name);
        const id = name.slice(prefix.length);
        if (uid) {
          const user = await env.DATA.get(`user:${uid}`, 'json');
          const plan = user?.plan || 'free';
          const entry = (await getIndex(env, uid)).find((e) => e.id === id);
          if (!entry || !isVisible(entry, plan, now)) await deleteStory(env, uid, id);
        }
        await env.DATA.delete(name);
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
  }
}

// Token del enlace para los abuelos: 128 bits aleatorios en hexadecimal.
export function newShareToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
