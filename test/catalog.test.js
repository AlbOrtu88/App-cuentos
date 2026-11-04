import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addToCatalog, ageRange, anonymize, anonymizeStory, bump } from '../src/catalog.js';

const input = { name: 'Lucía', companion: 'Tía Ana', petToy: 'Peluche Rex', age: 4 };

test('quita el nombre del niño, el acompañante y el juguete, también en mayúsculas o a medias', () => {
  const out = anonymize('Lucía abrazó a Peluche Rex y a Rex. LUCÍA rió con Tía Ana; Ana también.', input);
  assert.equal(out, '{NOMBRE} abrazó a {JUGUETE} y a {JUGUETE}. {NOMBRE} rió con {ACOMPAÑANTE}; {ACOMPAÑANTE} también.');
});

test('no toca palabras que solo contienen el nombre', () => {
  assert.equal(anonymize('Luciana y Lucía', input), 'Luciana y {NOMBRE}');
});

test('los valores por defecto no se tratan como nombres', () => {
  assert.equal(anonymize('Abrazó a su peluche preferido.', { name: 'el pequeño', petToy: 'su peluche preferido' }), 'Abrazó a su peluche preferido.');
});

test('los nombres inventados se quitan en todo el cuento', () => {
  const out = anonymizeStory(
    { titulo: 'Lucía y el búho Bartolo', parrafos: ['Vivía cerca el búho Bartolo.', 'Bartolo sonrió bajo la Luna. Fin.'] },
    input,
  );
  assert.equal(out.titulo, '{NOMBRE} y el búho {OTRO_NOMBRE}');
  assert.deepEqual(out.parrafos, ['Vivía cerca el búho {OTRO_NOMBRE}.', '{OTRO_NOMBRE} sonrió bajo la Luna. Fin.']);
});

test('rangos de edad', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 10].map(ageRange), ['0-1', '0-1', '2-3', '2-3', '4-5', '4-5', '6-7', '6-7', '8-10', '8-10']);
});

test('guarda la copia anónima con un id aleatorio y sin datos del usuario', async () => {
  const calls = [];
  const env = { CATALOG: { prepare: (sql) => ({ bind: (...args) => ({ run: async () => calls.push({ sql, args }) }) }) } };
  await addToCatalog(env, {
    catalogId: 'cat-1',
    story: { titulo: 'Lucía y la luna', parrafos: ['Lucía durmió.'] },
    input,
    lessonId: 'dark',
    styleId: 'watercolor',
    minutes: 3,
    createdAt: Date.UTC(2026, 10, 3),
  });
  assert.deepEqual(calls[0].args, ['cat-1', '{NOMBRE} y la luna', '["{NOMBRE} durmió."]', '4-5', 'dark', 3, 'watercolor', '2026-11']);
  assert.ok(!JSON.stringify(calls).includes('Lucía'));
  await bump(env, 'cat-1', 'escuchas');
  assert.match(calls[1].sql, /escuchas = escuchas \+ 1/);
  await bump(env, 'cat-1', 'uid; DROP TABLE');
  assert.equal(calls.length, 2, 'solo acepta contadores conocidos');
});

test('sin base de datos o con la opción desactivada no guarda nada', async () => {
  await addToCatalog({}, { catalogId: 'x', story: { titulo: '', parrafos: [] }, input });
  const calls = [];
  const env = { CATALOG: { prepare: () => { calls.push(1); return { bind: () => ({ run: async () => {} }) }; } } };
  await addToCatalog(env, { catalogId: null, story: { titulo: '', parrafos: [] }, input });
  assert.equal(calls.length, 0);
});
