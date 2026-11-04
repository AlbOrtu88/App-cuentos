// Catálogo anónimo para los libros de KDP: una copia de cada cuento sin nombres, con el
// rango de edad, la moraleja y cuánto lo leen y escuchan las familias.
// - Se anonimiza al guardar: nombre del niño, acompañante, juguete y cualquier otro nombre propio.
// - El id es aleatorio y no es el del cuento ni el del usuario.
// - Si la familia desactiva «Permitir que mis cuentos inspiren libros», no se guarda.
// Si no hay base de datos D1 configurada (binding CATALOG), no hace nada.

const MARKS = { name: '{NOMBRE}', companion: '{ACOMPAÑANTE}', petToy: '{JUGUETE}' };
const OTHER = '{OTRO_NOMBRE}';

// Valores por defecto de cleanField: no son nombres y no se sustituyen.
const DEFAULTS = new Set(['el pequeño', 'un amigo', 'su peluche preferido']);

// Palabras que pueden ir con mayúscula en mitad de una frase sin ser un nombre.
const NOT_NAMES = new Set(['Fin', 'Navidad', 'Reyes', 'Magos', 'Papá', 'Mamá', 'Noel', 'Luna', 'Sol', 'Tierra']);

const COUNTERS = new Set(['aperturas', 'escuchas', 'compartidos', 'aperturas_enlace']);

// Puntuación para elegir candidatos: escuchar y compartir pesan más que abrir.
export const SCORE_SQL = 'aperturas + 2 * escuchas + 3 * compartidos + 2 * aperturas_enlace';

export const AGE_RANGES = ['2-3', '4-5', '6-7', '8-10'];

export function ageRange(age) {
  if (age <= 3) return '2-3';
  if (age <= 5) return '4-5';
  if (age <= 7) return '6-7';
  return '8-10';
}

function escapeRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Sustituye los nombres por marcas. Los más largos van primero para que «Peluche Rex» no
// quede a medias por «Rex», y después se quitan las partes sueltas con mayúscula («Rex»).
// Por último, cualquier palabra con mayúscula en mitad de una frase se trata como otro nombre.
export function anonymize(text, input, found = null) {
  const pairs = Object.entries(MARKS)
    .map(([field, mark]) => [String(input[field] || '').trim(), mark])
    .filter(([value]) => value.length >= 2 && !DEFAULTS.has(value.toLowerCase()))
    .sort((a, b) => b[0].length - a[0].length);
  let out = text;
  for (const [value, mark] of pairs) {
    out = out.replace(new RegExp(`(?<![\\p{L}])${escapeRe(value)}(?![\\p{L}])`, 'giu'), mark);
  }
  for (const [value, mark] of pairs) {
    const parts = value.split(/\s+/).filter((w) => w.length >= 3 && /^\p{Lu}/u.test(w));
    if (parts.length === 1 && parts[0] === value) continue;
    for (const part of parts) {
      out = out.replace(new RegExp(`(?<![\\p{L}{])${escapeRe(part)}(?![\\p{L}}])`, 'gu'), mark);
    }
  }
  // Mayúscula que no va al principio de frase, de diálogo ni de cita.
  return out.replace(/(?<=[\p{Ll},;]\s+)\p{Lu}[\p{L}]+/gu, (word) => {
    if (NOT_NAMES.has(word)) return word;
    found?.add(word);
    return OTHER;
  });
}

// Anonimiza el cuento entero. Los nombres inventados que se detectan en mitad de una frase
// («el búho Bartolo») se quitan también cuando abren otra frase («Bartolo sonrió»).
export function anonymizeStory(story, input) {
  const found = new Set();
  const titulo = anonymize(story.titulo, input, found);
  const parrafos = story.parrafos.map((p) => anonymize(p, input, found));
  const rest = (text) => [...found].reduce(
    (out, name) => out.replace(new RegExp(`(?<![\\p{L}{])${escapeRe(name)}(?![\\p{L}}])`, 'gu'), OTHER),
    text,
  );
  return { titulo: rest(titulo), parrafos: parrafos.map(rest) };
}

export function newCatalogId() {
  return crypto.randomUUID();
}

export async function addToCatalog(env, { catalogId, story, input, lessonId, styleId, minutes, createdAt }) {
  if (!env.CATALOG || !catalogId) return;
  try {
    const clean = anonymizeStory(story, input);
    await env.CATALOG.prepare(
      'INSERT INTO cuentos (id, titulo, parrafos, rango_edad, moraleja, minutos, estilo, mes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      catalogId,
      clean.titulo,
      JSON.stringify(clean.parrafos),
      ageRange(input.age),
      lessonId,
      minutes,
      styleId,
      new Date(createdAt).toISOString().slice(0, 7),
    ).run();
  } catch (err) {
    console.error('[CATALOGO]', err.message);
  }
}

export async function bump(env, catalogId, counter) {
  if (!env.CATALOG || !catalogId || !COUNTERS.has(counter)) return;
  try {
    await env.CATALOG.prepare(`UPDATE cuentos SET ${counter} = ${counter} + 1 WHERE id = ?`).bind(catalogId).run();
  } catch (err) {
    console.error('[CATALOGO]', err.message);
  }
}

// Los mejores cuentos de un rango de edad (y moraleja), de más a menos leídos.
export async function topStories(env, { range = null, lesson = null, limit = 50 } = {}) {
  const where = [];
  const params = [];
  if (range) {
    where.push('rango_edad = ?');
    params.push(range);
  }
  if (lesson) {
    where.push('moraleja = ?');
    params.push(lesson);
  }
  const { results } = await env.CATALOG.prepare(
    `SELECT id, titulo, parrafos, rango_edad, moraleja, minutos, estilo, mes, aperturas, escuchas, compartidos, aperturas_enlace,
            ${SCORE_SQL} AS puntos
       FROM cuentos ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY puntos DESC, mes DESC LIMIT ?`,
  ).bind(...params, Math.min(Math.max(limit, 1), 500)).all();
  return results.map((r) => ({ ...r, parrafos: JSON.parse(r.parrafos) }));
}
