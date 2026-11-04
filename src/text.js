// Utilidades de texto sin dependencias, para poder probarlas con node --test.

// Limpia un campo libre del formulario: sin saltos de línea ni caracteres de control,
// sin llaves ni comillas que puedan romper el prompt, y con longitud máxima.
export function cleanField(value, fallback, max = 40) {
  if (typeof value !== 'string') return fallback;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[{}<>"`\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  return cleaned || fallback;
}

export function cleanAge(value) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return 5;
  return Math.min(Math.max(n, 0), 10);
}

// Quita nombres propios del texto que se manda al generador de imágenes.
export function stripNames(text, names) {
  let out = text;
  for (const name of names) {
    if (!name || name.length < 2) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'gi'), 'a child');
  }
  return out;
}

// Parte un texto en trozos de como mucho maxBytes (UTF-8), cortando por frases.
// Google TTS admite hasta 5.000 bytes por petición.
export function chunkText(text, maxBytes = 4500) {
  const enc = new TextEncoder();
  const sentences = text.match(/[^.!?…]+[.!?…]+["»”]?\s*|[^.!?…]+$/g) || [text];
  const chunks = [];
  let current = '';
  for (const s of sentences) {
    const candidate = current + s;
    if (enc.encode(candidate).length <= maxBytes) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current.trim());
    if (enc.encode(s).length <= maxBytes) {
      current = s;
    } else {
      // Frase enorme: se corta por palabras.
      let piece = '';
      for (const word of s.split(/(\s+)/)) {
        if (enc.encode(piece + word).length > maxBytes) {
          chunks.push(piece.trim());
          piece = word;
        } else {
          piece += word;
        }
      }
      current = piece;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}
