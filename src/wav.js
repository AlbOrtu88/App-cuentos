// Une varios WAV (mismo formato) en uno solo, con una pausa corta entre trozos.
// Chatterbox devuelve un WAV por cada trozo de texto.

function readChunks(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('No es un WAV');
  let fmt = null;
  let data = null;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = tag(offset);
    let size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    // Algunos generadores dejan el tamaño de data a 0 o 0xFFFFFFFF al escribir en streaming.
    if (id === 'data' && (size === 0 || start + size > bytes.length)) size = bytes.length - start;
    if (id === 'fmt ') fmt = bytes.subarray(start, start + size);
    if (id === 'data') data = bytes.subarray(start, start + size);
    offset = start + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('WAV incompleto');
  const fmtView = new DataView(fmt.buffer, fmt.byteOffset, fmt.byteLength);
  return {
    fmt,
    data,
    channels: fmtView.getUint16(2, true),
    sampleRate: fmtView.getUint32(4, true),
    blockAlign: fmtView.getUint16(12, true),
  };
}

function sameFormat(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function mergeWav(parts, pauseSeconds = 0.25) {
  if (parts.length === 0) throw new Error('Sin audio');
  const decoded = parts.map((p) => readChunks(p instanceof Uint8Array ? p : new Uint8Array(p)));
  const first = decoded[0];
  for (const d of decoded) {
    if (!sameFormat(d.fmt, first.fmt)) throw new Error('Los trozos de audio tienen formatos distintos');
  }
  const pauseBytes = Math.round(first.sampleRate * pauseSeconds) * first.blockAlign;
  const dataSize = decoded.reduce((n, d) => n + d.data.length, 0) + pauseBytes * (decoded.length - 1);
  const headerSize = 12 + 8 + first.fmt.length + 8;
  const out = new Uint8Array(headerSize + dataSize);
  const view = new DataView(out.buffer);
  const writeTag = (o, s) => {
    for (let i = 0; i < 4; i++) out[o + i] = s.charCodeAt(i);
  };
  writeTag(0, 'RIFF');
  view.setUint32(4, out.length - 8, true);
  writeTag(8, 'WAVE');
  writeTag(12, 'fmt ');
  view.setUint32(16, first.fmt.length, true);
  out.set(first.fmt, 20);
  let offset = 20 + first.fmt.length;
  writeTag(offset, 'data');
  view.setUint32(offset + 4, dataSize, true);
  offset += 8;
  decoded.forEach((d, i) => {
    if (i > 0) offset += pauseBytes; // silencio: el array ya viene a cero
    out.set(d.data, offset);
    offset += d.data.length;
  });
  return out;
}

// Comprueba que un audio subido es un WAV razonable para clonar la voz.
export function inspectWav(bytes) {
  const d = readChunks(bytes);
  const seconds = d.data.length / (d.sampleRate * d.blockAlign);
  return { channels: d.channels, sampleRate: d.sampleRate, seconds };
}
