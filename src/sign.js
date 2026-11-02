// URLs firmadas y de corta duración, para que fal.ai pueda leer la muestra de voz
// sin que esa muestra quede pública.

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function signPath(secret, path, ttlSec = 600, nowSec = Math.floor(Date.now() / 1000)) {
  const exp = nowSec + ttlSec;
  const sig = await hmacHex(secret, `${path}:${exp}`);
  return `${path}?exp=${exp}&sig=${sig}`;
}

export async function verifySignedPath(secret, path, exp, sig, nowSec = Math.floor(Date.now() / 1000)) {
  if (!secret || !exp || !sig) return false;
  const expNum = parseInt(exp, 10);
  if (!expNum || expNum < nowSec) return false;
  const expected = await hmacHex(secret, `${path}:${expNum}`);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
