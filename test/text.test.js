import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkText, cleanAge, cleanField, stripNames } from '../src/text.js';

test('cleanField quita caracteres peligrosos y recorta', () => {
  assert.equal(cleanField('  Lu\ncía {ignora} "todo"  ', 'x'), 'Lu cía ignora todo');
  assert.equal(cleanField('', 'fallback'), 'fallback');
  assert.equal(cleanField(42, 'fallback'), 'fallback');
  assert.equal(cleanField('a'.repeat(100), 'x').length, 40);
});

test('cleanAge limita a 0-10', () => {
  assert.equal(cleanAge('0'), 0);
  assert.equal(cleanAge('-3'), 0);
  assert.equal(cleanAge('1'), 1);
  assert.equal(cleanAge('15'), 10);
  assert.equal(cleanAge('abc'), 5);
  assert.equal(cleanAge(7), 7);
});

test('stripNames quita nombres del prompt de imagen', () => {
  assert.equal(stripNames('Lucía hugs Rex', ['Lucía', 'Rex']), 'a child hugs a child');
  assert.equal(stripNames('a child sleeps', ['', 'A']), 'a child sleeps');
});

test('chunkText respeta el límite de bytes y no pierde texto', () => {
  const text = 'Había una vez una niña. '.repeat(400);
  const chunks = chunkText(text, 4500);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(new TextEncoder().encode(c).length <= 4500);
  assert.equal(chunks.join(' ').replace(/\s+/g, ' ').trim(), text.replace(/\s+/g, ' ').trim());
});

test('chunkText con el límite de Chatterbox (290)', () => {
  const text = 'La lucecita bajó despacio y contó las estrellas una a una mientras todos dormían. '.repeat(20);
  for (const c of chunkText(text, 290)) assert.ok(c.length <= 290);
});
