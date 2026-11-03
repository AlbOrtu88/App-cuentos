// Cuentos Mágicos: lógica del navegador. Todo lo que cuesta dinero pasa por el Worker (/api/...).
'use strict';

const WPM = 125;
const PLAN_RANK = { free: 0, standard: 1, pro: 2, vip: 3 };
const PLANS = ['standard', 'vip', 'pro'];

// Deben coincidir con src/config.js (el servidor es quien manda; esto solo pinta la interfaz).
const DURATIONS = [
  { min: 2, plan: 'free' },
  { min: 3, plan: 'free' },
  { min: 5, plan: 'standard' },
  { min: 10, plan: 'pro' },
];
const STYLES = [
  { id: 'watercolor', plan: 'free', label: 'Acuarela suave' },
  { id: 'pixar', plan: 'standard', label: '3D Pixar' },
  { id: 'vintage', plan: 'standard', label: 'Cuento clásico' },
  { id: 'coloring', plan: 'standard', label: 'Lámina para colorear' },
  { id: 'ghibli', plan: 'pro', label: 'Anime Ghibli' },
  { id: 'clay', plan: 'pro', label: 'Plastilina 3D' },
  { id: 'papercut', plan: 'pro', label: 'Papel en capas' },
  { id: 'comic', plan: 'pro', label: 'Cómic ilustrado' },
  { id: 'felt', plan: 'pro', label: 'Fieltro y lana' },
  { id: 'pencil', plan: 'pro', label: 'Lápiz de color' },
];
const PER_MONTH = '<span class="text-xs font-normal text-noche-400">/mes</span>';
const PRICES = {
  annual: {
    standard: { price: `3,33 €${PER_MONTH}`, sub: 'Se factura 39,99 € al año', cta: '39,99 €/año' },
    pro: { price: `8,33 €${PER_MONTH}`, sub: 'Se factura 99,99 € al año', cta: '99,99 €/año' },
    vip: { price: `10,00 €${PER_MONTH}`, sub: 'Se factura 119,99 € al año', cta: '119,99 €/año' },
  },
  monthly: {
    standard: { price: `4,99 €${PER_MONTH}`, sub: 'Se factura cada mes', cta: '4,99 €/mes' },
    pro: { price: `12,99 €${PER_MONTH}`, sub: 'Se factura cada mes', cta: '12,99 €/mes' },
    vip: { price: `14,99 €${PER_MONTH}`, sub: 'Se factura cada mes', cta: '14,99 €/mes' },
  },
};
const PLAN_NAMES = { standard: 'Estándar', pro: 'Pro', vip: 'VIP' };

const state = {
  plan: 'free',
  freeRemaining: 3,
  hasBilling: false,
  duration: 3,
  styleId: 'watercolor',
  billing: 'annual',
  selectedPlan: 'vip',
  voicePlansEnabled: false,
  voices: [],
  maxVoices: 6,
  voiceId: '',
  story: null,
  from: 'creator', // vista a la que vuelve el lector: 'creator' | 'library'
  library: [],
  profiles: [],
  audioMode: null, // 'file' | 'speech' | null
  busy: false,
};

const $ = (id) => document.getElementById(id);

// ---------- API ----------

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* respuesta sin JSON */
  }
  return { ok: res.ok, status: res.status, data };
}

async function loadMe() {
  const { ok, data } = await api('/api/me');
  if (!ok) return;
  state.plan = data.plan || 'free';
  state.freeRemaining = data.freeRemaining;
  state.hasBilling = Boolean(data.hasBilling);
  state.hadTrial = Boolean(data.hadTrial);
  state.voicePlansEnabled = Boolean(data.voicePlansEnabled);
  state.voices = data.voices || [];
  state.maxVoices = data.maxVoices || 6;
  render();
}

// ---------- Interfaz ----------

const allows = (required) => PLAN_RANK[state.plan] >= PLAN_RANK[required];

function render() {
  renderQuota();
  renderProfiles();
  renderDurations();
  renderStyles();
  renderVoices();
  $('manage-btn').classList.toggle('hidden', !state.hasBilling);
}

function renderQuota() {
  const badge = $('quota-badge');
  badge.className = 'text-center text-[11px] font-medium py-1 px-3 rounded-full border';
  if (state.plan !== 'free') {
    badge.textContent = `Plan ${PLAN_NAMES[state.plan]} · cuentos ilimitados`;
    badge.classList.add('bg-emerald-500/10', 'text-emerald-300', 'border-emerald-500/30');
  } else if (state.freeRemaining > 0) {
    badge.textContent = `Tienes ${state.freeRemaining} de 3 cuentos gratis`;
    badge.classList.add('bg-melocoton-500/10', 'text-melocoton-300', 'border-melocoton-500/30');
  } else {
    badge.textContent = 'Has usado tus 3 cuentos gratis';
    badge.classList.add('bg-rose-500/10', 'text-rose-300', 'border-rose-500/30');
  }
}

function lockLabel(plan) {
  return plan === 'standard' ? '⭐' : '👑';
}

function renderDurations() {
  const box = $('duration-options');
  box.innerHTML = '';
  for (const d of DURATIONS) {
    const locked = !allows(d.plan);
    const selected = state.duration === d.min;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `option-btn ${selected ? 'option-btn-active' : ''} ${locked ? 'option-btn-locked' : ''}`;
    btn.textContent = `${locked ? lockLabel(d.plan) + ' ' : ''}${d.min} min`;
    btn.setAttribute('aria-pressed', String(selected));
    btn.addEventListener('click', () => {
      if (locked) return openPaywall(d.plan === 'standard' ? 'Los cuentos de 5 minutos están desde el plan Estándar.' : 'Los cuentos de 10 minutos están en los planes Pro y VIP.');
      state.duration = d.min;
      renderDurations();
    });
    box.appendChild(btn);
  }
  $('time-hint').textContent = `≈ ${state.duration * WPM} palabras`;
}

function renderStyles() {
  const box = $('style-options');
  box.innerHTML = '';
  for (const s of STYLES) {
    const locked = !allows(s.plan);
    const selected = state.styleId === s.id;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `option-btn text-left ${selected ? 'option-btn-active' : ''} ${locked ? 'option-btn-locked' : ''}`;
    btn.textContent = `${locked ? lockLabel(s.plan) + ' ' : ''}${s.label}`;
    btn.setAttribute('aria-pressed', String(selected));
    btn.addEventListener('click', () => {
      if (locked) return openPaywall(s.plan === 'standard' ? 'Este estilo está desde el plan Estándar.' : 'Este estilo está en los planes Pro y VIP.');
      state.styleId = s.id;
      renderStyles();
    });
    box.appendChild(btn);
  }
  const unlocked = STYLES.filter((s) => allows(s.plan)).length;
  $('style-hint').textContent = `${unlocked} de ${STYLES.length} disponibles`;
}

let toastTimer;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 4000);
}

function setBusy(busy) {
  state.busy = busy;
  $('generate-btn').disabled = busy;
  $('generate-btn').classList.toggle('opacity-50', busy);
  $('loader').classList.toggle('hidden', !busy);
}

// ---------- Generar ----------

async function generate() {
  if (state.busy) return;
  if (state.plan === 'free' && state.freeRemaining === 0) {
    return openPaywall('Has disfrutado tus 3 cuentos gratis. Suscríbete para seguir creando uno cada noche.');
  }

  const payload = {
    childName: $('child-name').value.trim() || 'Leo',
    childAge: parseInt($('child-age').value, 10) || 5,
    companion: $('companion-name').value.trim(),
    petToy: $('pet-toy').value.trim(),
    lessonId: $('story-lesson').value,
    duration: state.duration,
    styleId: state.styleId,
  };

  setBusy(true);
  try {
    const { ok, status, data } = await api('/api/generate-story', { method: 'POST', body: JSON.stringify(payload) });
    if (!ok) {
      if (status === 402 && data.code === 'quota') {
        state.freeRemaining = 0;
        render();
        return openPaywall('Has disfrutado tus 3 cuentos gratis. Suscríbete para seguir creando uno cada noche.');
      }
      if (status === 402) return openPaywall(data.error, data.needed);
      return toast(data.error || 'No se pudo crear el cuento. Inténtalo de nuevo.');
    }
    if (data.freeRemaining !== null && data.freeRemaining !== undefined) state.freeRemaining = data.freeRemaining;
    render();
    showStory(data);
  } catch {
    toast('Sin conexión. Revisa internet e inténtalo de nuevo.');
  } finally {
    setBusy(false);
  }
}

function showStory(story, from = 'creator') {
  state.story = { ...story, audio: { ...(story.audio || {}) } };
  state.from = from;
  stopAudio();
  $('story-title').textContent = story.titulo;
  $('reading-badge').textContent = `⏱ ${story.minutes} min`;

  const content = $('story-content');
  content.innerHTML = '';
  story.parrafos.forEach((text, i) => {
    const p = document.createElement('p');
    p.textContent = text;
    p.dataset.index = String(i);
    p.className = 'transition-colors duration-300 rounded-lg';
    content.appendChild(p);
  });

  const img = $('story-image');
  img.classList.add('opacity-0');
  if (story.imageUrl) {
    $('image-box').classList.remove('hidden');
    img.onload = () => img.classList.remove('opacity-0');
    img.onerror = () => $('image-box').classList.add('hidden');
    img.src = story.imageUrl;
  } else {
    $('image-box').classList.add('hidden');
  }

  renderVoiceSelect();
  renderReaderActions();
  $('close-reader').textContent = from === 'library' ? '← Mis cuentos' : '← Crear otro';
  $('creator-view').classList.add('hidden');
  $('library-view').classList.add('hidden');
  $('reader-view').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeReader() {
  stopAudio();
  $('reader-view').classList.add('hidden');
  if (state.from === 'library') openLibrary();
  else $('creator-view').classList.remove('hidden');
}

// ---------- Audio ----------
// De pago: MP3 con voz natural generado en el servidor (se guarda y se reutiliza).
// Gratis o si falla: la voz del propio dispositivo, párrafo a párrafo.

function setAudioButton(playing, loading = false) {
  $('audio-icon').textContent = loading ? '⏳' : playing ? '⏸' : '🔊';
  $('audio-label').textContent = loading ? (state.voiceId ? 'Preparando voz (1 min)' : 'Preparando') : playing ? 'Pausar' : 'Escuchar';
}

function renderVoiceSelect() {
  const select = $('voice-select');
  const show = state.voices.some((v) => v.usable);
  select.classList.toggle('hidden', !show);
  select.innerHTML = '';
  const options = [{ id: '', name: 'Narrador' }, ...state.voices.filter((v) => v.usable)];
  for (const v of options) {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = v.id ? `Voz de ${v.name}` : v.name;
    select.appendChild(opt);
  }
  if (!options.some((v) => v.id === state.voiceId)) state.voiceId = '';
  select.value = state.voiceId;
}

async function toggleAudio() {
  const audio = $('story-audio');
  if (state.audioMode === 'file') {
    if (audio.paused) audio.play();
    else audio.pause();
    return;
  }
  if (state.audioMode === 'speech') {
    stopAudio();
    return;
  }

  if (state.plan !== 'free' && state.story) {
    const url = await ensureAudio();
    if (url) {
      state.audioMode = 'file';
      audio.src = url;
      await audio.play().catch(() => {});
      return;
    }
    // Si la voz de la familia falla, no se sustituye en silencio por la del móvil.
    if (state.voiceId) return;
  }
  startSpeech();
}

// Devuelve la URL del audio del cuento con la voz elegida. Si ya se narró, no se vuelve
// a pagar: se reutiliza. Si falla, avisa y devuelve null. Con required=true avisa siempre,
// porque no hay voz del navegador que la sustituya (descargar o compartir).
async function ensureAudio(required = false) {
  const known = state.story.audio[state.voiceId];
  if (known) return known;
  setAudioButton(false, true);
  try {
    const { ok, data } = await api(`/api/story/${state.story.id}/audio`, {
      method: 'POST',
      body: JSON.stringify({ voiceId: state.voiceId || undefined }),
    });
    if (ok && data.audioUrl) {
      state.story.audio[state.voiceId] = data.audioUrl;
      return data.audioUrl;
    }
    setAudioButton(false);
    if (state.voiceId) {
      toast(data.error && data.code !== 'no_tts' ? data.error : 'La voz de la familia no está disponible ahora. Prueba con el narrador.');
    } else if (data.error && data.code !== 'no_tts') {
      toast(data.error);
    } else if (required) {
      toast('La narración no está disponible ahora. Inténtalo más tarde.');
    }
  } catch {
    setAudioButton(false);
    if (state.voiceId || required) toast('Sin conexión. Inténtalo de nuevo.');
  }
  return null;
}

function startSpeech() {
  if (!('speechSynthesis' in window)) {
    setAudioButton(false);
    return toast('Tu navegador no puede leer en voz alta.');
  }
  const paragraphs = [state.story.titulo, ...state.story.parrafos];
  const voices = speechSynthesis.getVoices();
  const voice = voices.find((v) => v.lang === 'es-ES') || voices.find((v) => v.lang.startsWith('es'));
  state.audioMode = 'speech';
  setAudioButton(true);

  let i = 0;
  const next = () => {
    if (state.audioMode !== 'speech') return;
    highlight(i - 1);
    if (i >= paragraphs.length) return stopAudio();
    const u = new SpeechSynthesisUtterance(paragraphs[i]);
    u.lang = 'es-ES';
    if (voice) u.voice = voice;
    u.rate = 0.88;
    u.pitch = 1.05;
    u.onend = next;
    u.onerror = () => stopAudio();
    i += 1;
    speechSynthesis.speak(u);
  };
  speechSynthesis.cancel();
  next();
}

function highlight(index) {
  document.querySelectorAll('#story-content p').forEach((p) => {
    p.classList.toggle('bg-melocoton-400/10', Number(p.dataset.index) === index);
  });
}

function stopAudio() {
  const audio = $('story-audio');
  audio.pause();
  audio.removeAttribute('src');
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  state.audioMode = null;
  highlight(-1);
  setAudioButton(false);
}

// ---------- Voces de la familia (Pro y VIP) ----------

function renderVoices() {
  const list = $('voices-list');
  list.innerHTML = '';
  for (const v of state.voices) {
    const li = document.createElement('li');
    li.className = 'flex items-center gap-1 bg-lavanda-500/10 border border-lavanda-500/30 text-lavanda-200 text-xs rounded-full pl-3 pr-1 py-0.5';
    const name = document.createElement('span');
    name.textContent = v.name;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'px-1.5 text-lavanda-300 hover:text-rose-300';
    del.setAttribute('aria-label', `Borrar la voz de ${v.name}`);
    del.textContent = '✕';
    del.addEventListener('click', () => askAdult(() => deleteVoice(v)));
    li.append(name, del);
    list.appendChild(li);
  }
  $('voices-empty').classList.toggle('hidden', state.voices.length > 0);
  $('add-voice-btn').classList.toggle('hidden', state.plan === 'vip' && state.voices.length >= state.maxVoices);
  $('voices-empty').textContent = state.maxVoices > 0 && state.maxVoices < 6
    ? 'Tu plan incluye 1 voz. Con el VIP puedes guardar hasta 6.'
    : 'Graba a papá, mamá, los abuelos o los tíos y que el cuento se lea con su voz.';
}

async function deleteVoice(v) {
  if (!confirm(`¿Borrar la voz de ${v.name}? Se borrarán también los cuentos narrados con ella.`)) return;
  const { ok, data } = await api(`/api/voices/${v.id}`, { method: 'DELETE' });
  if (!ok) return toast(data.error || 'No se pudo borrar la voz.');
  state.voices = data.voices;
  renderVoices();
  toast('Voz borrada.');
}

const recorder = { media: null, stream: null, chunks: [], wav: null, timer: null, started: 0, consent: null };

function openVoiceModal() {
  if (state.maxVoices === 0) {
    return openPaywall('Graba a papá, mamá o los abuelos y que lean el cuento con su voz. Prueba el VIP 3 días gratis.');
  }
  if (state.voices.length >= state.maxVoices) {
    return openPaywall('Con el VIP puedes guardar hasta 6 voces de la familia y escucharlas 2 horas al mes.');
  }
  askAdult(showVoiceModal);
}

function showVoiceModal() {
  $('voice-step1').reset();
  $('voice-label-box').classList.add('hidden');
  $('voice-error1').classList.add('hidden');
  $('voice-error').classList.add('hidden');
  $('record-preview').classList.add('hidden');
  $('record-time').textContent = '0 s';
  $('voice-step1').classList.remove('hidden');
  $('voice-step2').classList.add('hidden');
  recorder.wav = null;
  recorder.consent = null;
  updateSaveVoice();
  $('voice-modal').classList.remove('hidden');
}

function voiceLabel() {
  const relation = $('voice-relation').value;
  return relation === 'otro' ? $('voice-name').value.trim() : relation;
}

function submitVoiceStep1(e) {
  e.preventDefault();
  const speaker = $('speaker-name').value.trim();
  const relation = $('voice-relation').value;
  const label = voiceLabel();
  const err = $('voice-error1');
  err.classList.add('hidden');
  const fail = (msg) => {
    err.textContent = msg;
    err.classList.remove('hidden');
  };
  if (!speaker) return fail('Escribe el nombre de quien graba.');
  if (!relation) return fail('Elige la relación con el niño o niña.');
  if (!label) return fail('Ponle un nombre a la voz.');
  if (state.voices.some((v) => v.name.toLowerCase() === label.toLowerCase())) return fail(`Ya tienes una voz llamada ${label}.`);
  if (!$('voice-consent').checked) return fail('La persona que graba tiene que marcar la casilla de consentimiento.');
  recorder.consent = { speaker, relation: relation === 'otro' ? 'Otro' : relation, label };
  $('consent-speaker').textContent = speaker;
  $('voice-step1').classList.add('hidden');
  $('voice-step2').classList.remove('hidden');
}

function closeVoiceModal() {
  stopRecording(true);
  $('voice-modal').classList.add('hidden');
}

function updateSaveVoice() {
  $('save-voice').disabled = !(recorder.wav && recorder.consent);
}

function showVoiceError(message) {
  const el = $('voice-error');
  el.textContent = message;
  el.classList.remove('hidden');
}

async function toggleRecording() {
  if (recorder.media && recorder.media.state === 'recording') return stopRecording();
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    return showVoiceError('Este navegador no permite grabar. Prueba con Chrome o Safari actualizados.');
  }
  try {
    recorder.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
  } catch {
    return showVoiceError('No hay permiso para usar el micrófono.');
  }
  $('voice-error').classList.add('hidden');
  recorder.chunks = [];
  recorder.wav = null;
  recorder.media = new MediaRecorder(recorder.stream);
  recorder.media.ondataavailable = (e) => e.data.size && recorder.chunks.push(e.data);
  recorder.media.onstop = finishRecording;
  recorder.media.start();
  recorder.started = Date.now();
  $('record-btn').textContent = '■ Parar';
  recorder.timer = setInterval(() => {
    const secs = Math.floor((Date.now() - recorder.started) / 1000);
    $('record-time').textContent = `${secs} s`;
    if (secs >= 40) stopRecording();
  }, 250);
}

function stopRecording(discard = false) {
  clearInterval(recorder.timer);
  $('record-btn').textContent = '● Grabar';
  if (recorder.media && recorder.media.state === 'recording') {
    if (discard) recorder.media.onstop = null;
    recorder.media.stop();
  }
  recorder.stream?.getTracks().forEach((t) => t.stop());
}

async function finishRecording() {
  const secs = (Date.now() - recorder.started) / 1000;
  if (secs < 12) {
    updateSaveVoice();
    return showVoiceError('Lee la frase de consentimiento y el texto completo (unos 25 segundos).');
  }
  try {
    const blob = new Blob(recorder.chunks, { type: recorder.media.mimeType });
    recorder.wav = await toWav(blob, 24000);
    const preview = $('record-preview');
    preview.src = URL.createObjectURL(recorder.wav);
    preview.classList.remove('hidden');
  } catch {
    showVoiceError('No se pudo procesar la grabación. Vuelve a intentarlo.');
  }
  updateSaveVoice();
}

// Convierte la grabación del navegador (webm/mp4) a WAV mono de 16 bits.
async function toWav(blob, sampleRate) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  ctx.close();
  const length = Math.ceil(decoded.duration * sampleRate);
  const offline = new OfflineAudioContext(1, length, sampleRate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const samples = (await offline.startRendering()).getChannelData(0);

  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const tag = (o, s) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  tag(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

async function saveVoice() {
  const { speaker, relation, label } = recorder.consent;
  const btn = $('save-voice');
  btn.disabled = true;
  btn.textContent = 'Guardando...';
  try {
    const params = new URLSearchParams({ consent: '1', name: label, speaker, relation });
    const res = await fetch(`/api/voices?${params}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'audio/wav' },
      body: recorder.wav,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return showVoiceError(data.error || 'No se pudo guardar la voz.');
    state.voices = data.voices;
    renderVoices();
    closeVoiceModal();
    toast(`Voz de ${label} guardada. Elígela al escuchar un cuento.`);
  } catch {
    showVoiceError('Sin conexión. Inténtalo de nuevo.');
  } finally {
    btn.textContent = 'Guardar voz';
    updateSaveVoice();
  }
}

// ---------- Perfiles de hermanos (VIP) ----------
// Se guardan solo en este dispositivo: el servidor no necesita conocerlos.

const PROFILES_KEY = 'cm_profiles';
const MAX_PROFILES = 6;

// Si el navegador no deja guardar (modo privado), se recuerda solo mientras la página esté abierta.
const memoryStore = {};

function readStore(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    if (saved !== null) return JSON.parse(saved);
  } catch {
    /* almacenamiento no disponible */
  }
  return memoryStore[key] ?? fallback;
}

function writeStore(key, value) {
  memoryStore[key] = value;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* almacenamiento no disponible */
  }
}

function renderProfiles() {
  const list = $('profiles-list');
  list.innerHTML = '';
  const vip = allows('vip');
  for (const p of state.profiles) {
    const li = document.createElement('li');
    li.className = 'flex items-center gap-1 bg-melocoton-500/10 border border-melocoton-500/30 text-melocoton-200 text-xs rounded-full pl-1 pr-1 py-0.5';
    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'px-2 py-0.5 hover:text-noche-50';
    pick.textContent = `${p.name} · ${p.age}`;
    pick.addEventListener('click', () => applyProfile(p));
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'px-1.5 text-melocoton-300/70 hover:text-rose-300';
    del.setAttribute('aria-label', `Borrar el perfil de ${p.name}`);
    del.textContent = '✕';
    del.addEventListener('click', () => deleteProfile(p));
    li.append(pick, del);
    list.appendChild(li);
  }
  $('profiles-empty').classList.toggle('hidden', state.profiles.length > 0);
  $('save-profile-btn').classList.toggle('hidden', vip && state.profiles.length >= MAX_PROFILES);
}

function applyProfile(p) {
  if (!allows('vip')) return openPaywall('Guarda un perfil para cada hermano con el VIP. Pruébalo 3 días gratis.');
  $('child-name').value = p.name;
  $('child-age').value = p.age;
  $('companion-name').value = p.companion || '';
  $('pet-toy').value = p.petToy || '';
  toast(`Cuento para ${p.name}`);
}

function saveProfile() {
  if (!allows('vip')) return openPaywall('Guarda un perfil para cada hermano, con su edad y su peluche, con el VIP. Pruébalo 3 días gratis.');
  const name = $('child-name').value.trim();
  if (!name) return toast('Escribe primero el nombre del peque.');
  const profile = {
    name: name.slice(0, 40),
    age: parseInt($('child-age').value, 10) || 5,
    companion: $('companion-name').value.trim().slice(0, 40),
    petToy: $('pet-toy').value.trim().slice(0, 40),
  };
  const rest = state.profiles.filter((p) => p.name.toLowerCase() !== profile.name.toLowerCase());
  if (rest.length >= MAX_PROFILES) return toast(`Puedes guardar hasta ${MAX_PROFILES} perfiles.`);
  state.profiles = [...rest, profile];
  writeStore(PROFILES_KEY, state.profiles);
  renderProfiles();
  toast(`Perfil de ${profile.name} guardado.`);
}

function deleteProfile(p) {
  state.profiles = state.profiles.filter((x) => x !== p);
  writeStore(PROFILES_KEY, state.profiles);
  renderProfiles();
}

// ---------- Biblioteca ----------
// Volver a leer y escuchar un cuento no gasta nada: el texto, la imagen y el audio ya están guardados.

const OFFLINE_KEY = 'cm_offline';
const OFFLINE_CACHE = 'cuentos-offline';

async function openLibrary() {
  stopAudio();
  $('creator-view').classList.add('hidden');
  $('reader-view').classList.add('hidden');
  $('library-view').classList.remove('hidden');
  window.scrollTo({ top: 0 });
  const offline = readStore(OFFLINE_KEY, {});
  try {
    const { ok, data } = await api('/api/stories');
    if (!ok) throw new Error();
    state.library = data.stories || [];
    renderLibrary(data.forever, offline, false);
  } catch {
    // Sin conexión: solo los cuentos descargados.
    state.library = Object.values(offline);
    renderLibrary(true, offline, true);
  }
}

function renderLibrary(forever, offline, isOffline) {
  const note = $('library-note');
  note.innerHTML = '';
  if (isOffline) {
    note.textContent = 'Sin conexión: estos son los cuentos que guardaste en el dispositivo.';
  } else if (forever) {
    note.textContent = 'Con el VIP tus cuentos se guardan para siempre. Abre un cuento y pulsa «Guardar sin conexión» para escucharlo sin internet.';
  } else {
    note.append('Se guardan los cuentos de los últimos 30 días. ');
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'text-lavanda-300 underline';
    more.textContent = 'Con el VIP, para siempre y sin conexión.';
    more.addEventListener('click', () => openPaywall('Guarda todos los cuentos para siempre y escúchalos sin conexión con el VIP.'));
    note.appendChild(more);
  }

  const list = $('library-list');
  list.innerHTML = '';
  for (const s of state.library) {
    const li = document.createElement('li');
    li.className = 'flex items-center gap-3 bg-noche-950/60 border border-noche-800 rounded-2xl p-2';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'flex flex-1 items-center gap-3 text-left min-w-0';
    const thumb = document.createElement(s.imageUrl ? 'img' : 'div');
    thumb.className = 'w-14 h-14 rounded-xl object-cover bg-noche-800 shrink-0 flex items-center justify-center text-xl';
    if (s.imageUrl) {
      thumb.src = s.imageUrl;
      thumb.alt = '';
      thumb.loading = 'lazy';
    } else {
      thumb.textContent = '🌙';
    }
    const text = document.createElement('div');
    text.className = 'min-w-0';
    const title = document.createElement('p');
    title.className = 'text-sm font-semibold text-melocoton-100 truncate';
    title.textContent = s.titulo;
    const meta = document.createElement('p');
    meta.className = 'text-[11px] text-noche-400';
    const date = new Date(s.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    meta.textContent = [s.child, `${s.minutes} min`, date, offline[s.id] ? '⬇ sin conexión' : ''].filter(Boolean).join(' · ');
    text.append(title, meta);
    open.append(thumb, text);
    open.addEventListener('click', () => openSavedStory(s.id));
    li.appendChild(open);
    if (!isOffline) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'px-2 text-noche-500 hover:text-rose-300';
      del.setAttribute('aria-label', `Borrar ${s.titulo}`);
      del.textContent = '✕';
      del.addEventListener('click', () => askAdult(() => deleteSavedStory(s)));
      li.appendChild(del);
    }
    list.appendChild(li);
  }
  $('library-empty').classList.toggle('hidden', state.library.length > 0);
}

async function openSavedStory(id) {
  try {
    const { ok, data } = await api(`/api/story/${id}`);
    if (!ok) return toast(data.error || 'No se pudo abrir el cuento.');
    showStory(data, 'library');
  } catch {
    toast('Este cuento no está guardado sin conexión.');
  }
}

async function deleteSavedStory(s) {
  if (!confirm(`¿Borrar «${s.titulo}»? Se borrarán también su dibujo y sus audios.`)) return;
  const { ok, data } = await api(`/api/story/${s.id}`, { method: 'DELETE' });
  if (!ok) return toast(data.error || 'No se pudo borrar.');
  await removeOffline(s.id);
  openLibrary();
}

function renderReaderActions() {
  const vip = allows('vip');
  const offline = readStore(OFFLINE_KEY, {});
  const saved = Boolean(offline[state.story.id]);
  $('btn-offline').textContent = `${vip ? '' : '👑 '}${saved ? '✓ Guardado sin conexión' : '⬇ Guardar sin conexión'}`;
  $('btn-share').textContent = `${vip ? '' : '👑 '}💌 Enviar a los abuelos`;
}

// VIP: guarda el cuento, su dibujo y su audio en el dispositivo para el coche o el avión.
async function saveOffline() {
  if (!allows('vip')) return openPaywall('Descarga los cuentos para escucharlos en el coche o en el avión con el VIP. Pruébalo 3 días gratis.');
  if (!('caches' in window)) return toast('Este navegador no permite guardar sin conexión.');
  const s = state.story;
  const btn = $('btn-offline');
  btn.disabled = true;
  btn.textContent = '⏳ Guardando...';
  try {
    const audioUrl = await ensureAudio(true);
    setAudioButton(state.audioMode === 'file' && !$('story-audio').paused);
    if (!audioUrl) return;
    const cache = await caches.open(OFFLINE_CACHE);
    await cache.addAll([`/api/story/${s.id}`, audioUrl, ...(s.imageUrl ? [s.imageUrl] : [])]);
    const offline = readStore(OFFLINE_KEY, {});
    const entry = state.library.find((e) => e.id === s.id) || {};
    offline[s.id] = { id: s.id, titulo: s.titulo, minutes: s.minutes, imageUrl: s.imageUrl, child: entry.child, createdAt: s.createdAt || Date.now() };
    writeStore(OFFLINE_KEY, offline);
    toast('Guardado. Lo encontrarás en «Mis cuentos» aunque no haya conexión.');
  } catch {
    toast('No se pudo guardar sin conexión. Inténtalo con conexión.');
  } finally {
    btn.disabled = false;
    renderReaderActions();
  }
}

async function removeOffline(id) {
  const offline = readStore(OFFLINE_KEY, {});
  if (!offline[id]) return;
  delete offline[id];
  writeStore(OFFLINE_KEY, offline);
  if (!('caches' in window)) return;
  const cache = await caches.open(OFFLINE_CACHE);
  for (const req of await cache.keys()) {
    if (req.url.includes(id)) await cache.delete(req);
  }
}

// ---------- Enlace para los abuelos (VIP) ----------

let shareStoryId = null;

function shareStory() {
  if (!allows('vip')) return openPaywall('Envía el cuento a los abuelos para que lo escuchen desde su móvil, con el VIP. Pruébalo 3 días gratis.');
  askAdult(createShareLink);
}

async function createShareLink() {
  const btn = $('btn-share');
  btn.disabled = true;
  try {
    const audioUrl = await ensureAudio(true);
    setAudioButton(state.audioMode === 'file' && !$('story-audio').paused);
    if (!audioUrl) return;
    const { ok, data } = await api(`/api/story/${state.story.id}/share`, {
      method: 'POST',
      body: JSON.stringify({ voiceId: state.voiceId || undefined }),
    });
    if (!ok) return toast(data.error || 'No se pudo crear el enlace.');
    shareStoryId = state.story.id;
    $('share-url').value = data.url;
    $('share-send').classList.toggle('hidden', !navigator.share);
    $('share-modal').classList.remove('hidden');
  } catch {
    toast('Sin conexión. Inténtalo de nuevo.');
  } finally {
    btn.disabled = false;
  }
}

function closeShare() {
  $('share-modal').classList.add('hidden');
}

async function copyShareLink() {
  const url = $('share-url').value;
  try {
    await navigator.clipboard.writeText(url);
    toast('Enlace copiado. Pégalo en WhatsApp para los abuelos.');
  } catch {
    $('share-url').select();
    toast('Mantén pulsado el enlace para copiarlo.');
  }
}

async function sendShareLink() {
  try {
    await navigator.share({ title: state.story?.titulo || 'Un cuento', text: 'Escucha el cuento de esta noche 🌙', url: $('share-url').value });
  } catch {
    /* el usuario cerró el menú */
  }
}

async function revokeShareLink() {
  if (!shareStoryId) return;
  const { ok } = await api(`/api/story/${shareStoryId}/share`, { method: 'DELETE' });
  closeShare();
  toast(ok ? 'Enlace desactivado. Ya nadie puede abrirlo.' : 'No se pudo desactivar el enlace.');
}

// ---------- Suscripción ----------

// Siempre se abre con el VIP elegido: es el plan que queremos que compare primero.
function openPaywall(reason) {
  state.selectedPlan = state.voicePlansEnabled ? 'vip' : 'standard';
  $('paywall-reason').textContent = reason || 'Cuentos ilimitados, narrados con voz natural y con valores.';
  $('checkout-error').classList.add('hidden');
  $('desist-consent').checked = false;
  $('btn-cta').disabled = true;
  renderPrices();
  $('paywall-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closePaywall() {
  $('paywall-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

function renderPrices() {
  const p = PRICES[state.billing];
  if (!state.voicePlansEnabled) state.selectedPlan = 'standard';
  for (const plan of PLANS) {
    $(`price-${plan}`).innerHTML = p[plan].price;
    $(`subtext-${plan}`).textContent = p[plan].sub;
    const card = $(`card-${plan}`);
    const disabled = plan !== 'standard' && !state.voicePlansEnabled;
    card.classList.toggle('plan-card-active', state.selectedPlan === plan);
    card.classList.toggle('plan-card-disabled', disabled);
    card.setAttribute('aria-checked', String(state.selectedPlan === plan));
    card.setAttribute('aria-disabled', String(disabled));
  }
  $('vip-badge').textContent = state.voicePlansEnabled ? 'El favorito de las familias' : 'Próximamente';
  $('cta-title').textContent = `Suscribirme por ${p[state.selectedPlan].cta}`;
  $('cta-subtext').textContent = state.selectedPlan === 'vip' && !state.hadTrial ? 'Los 3 primeros días son gratis' : '';
}

// Control parental: una suma sencilla antes de ir al pago o al portal.
let gateAction = null;
let gateResult = 0;

const NUM_LETRA = {
  3: 'tres', 4: 'cuatro', 5: 'cinco', 6: 'seis', 7: 'siete', 8: 'ocho', 9: 'nueve',
  12: 'doce', 13: 'trece', 14: 'catorce', 15: 'quince', 16: 'dieciséis',
  17: 'diecisiete', 18: 'dieciocho', 19: 'diecinueve', 21: 'veintiuno',
  22: 'veintidós', 23: 'veintitrés', 24: 'veinticuatro', 25: 'veinticinco',
  26: 'veintiséis', 27: 'veintisiete', 28: 'veintiocho', 29: 'veintinueve',
};
const GRANDES = [12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29];

// Operación escrita en letra para que un niño pequeño no la resuelva solo.
function askAdult(action) {
  const a = GRANDES[Math.floor(Math.random() * GRANDES.length)];
  const b = 3 + Math.floor(Math.random() * 7);
  gateResult = a * b;
  gateAction = action;
  $('gate-question').textContent = `¿Cuánto es ${NUM_LETRA[a]} por ${NUM_LETRA[b]}?`;
  $('gate-answer').value = '';
  $('gate-error').classList.add('hidden');
  $('gate-modal').classList.remove('hidden');
  $('gate-answer').focus();
}

function closeGate() {
  $('gate-modal').classList.add('hidden');
  gateAction = null;
}

async function startCheckout() {
  const btn = $('btn-cta');
  btn.disabled = true;
  btn.classList.add('opacity-60');
  try {
    const { ok, data } = await api('/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: state.selectedPlan, billing: state.billing, acceptedImmediateStart: true }),
    });
    if (ok && data.url) {
      window.location.href = data.url;
      return;
    }
    showCheckoutError(data.error || 'No se pudo abrir el pago.');
  } catch {
    showCheckoutError('Sin conexión. Inténtalo de nuevo.');
  } finally {
    btn.disabled = !$('desist-consent').checked;
    btn.classList.remove('opacity-60');
  }
}

function showCheckoutError(message) {
  const el = $('checkout-error');
  el.textContent = message;
  el.classList.remove('hidden');
}

async function openPortal() {
  const { ok, data } = await api('/api/portal', { method: 'POST' });
  if (ok && data.url) window.location.href = data.url;
  else toast(data.error || 'No se pudo abrir la gestión de la suscripción.');
}

// Al volver de Stripe el webhook puede tardar unos segundos en activar el plan.
async function handleCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  const result = params.get('checkout');
  if (!result) return;
  history.replaceState(null, '', window.location.pathname);
  if (result === 'cancel') return toast('Pago cancelado. No se ha cobrado nada.');

  toast('Activando tu suscripción...');
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    await loadMe();
    if (state.plan !== 'free') return toast('¡Listo! Ya tienes cuentos ilimitados.');
  }
  toast('El pago se ha recibido. Si no ves el plan activo, recarga en un minuto.');
}

// ---------- Arranque ----------

function bind() {
  $('generate-btn').addEventListener('click', generate);
  $('library-btn').addEventListener('click', openLibrary);
  $('close-library').addEventListener('click', () => {
    $('library-view').classList.add('hidden');
    $('creator-view').classList.remove('hidden');
  });
  $('save-profile-btn').addEventListener('click', saveProfile);
  $('btn-offline').addEventListener('click', () => saveOffline());
  $('btn-share').addEventListener('click', shareStory);
  $('close-share').addEventListener('click', closeShare);
  $('share-copy').addEventListener('click', () => copyShareLink());
  $('share-send').addEventListener('click', sendShareLink);
  $('share-revoke').addEventListener('click', () => askAdult(revokeShareLink));
  $('close-reader').addEventListener('click', closeReader);
  $('btn-audio').addEventListener('click', toggleAudio);
  $('close-paywall').addEventListener('click', closePaywall);
  $('paywall-modal').addEventListener('click', (e) => {
    if (e.target.id === 'paywall-modal') closePaywall();
  });
  $('btn-period-annual').addEventListener('click', () => {
    state.billing = 'annual';
    renderPrices();
  });
  $('btn-period-monthly').addEventListener('click', () => {
    state.billing = 'monthly';
    renderPrices();
  });
  $('btn-cta').addEventListener('click', () => askAdult(startCheckout));
  $('desist-consent').addEventListener('change', (e) => {
    $('btn-cta').disabled = !e.target.checked;
  });
  document.querySelectorAll('.adult-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      askAdult(() => {
        window.location.href = link.getAttribute('href');
      });
    });
  });
  $('manage-btn').addEventListener('click', () => askAdult(openPortal));
  $('gate-cancel').addEventListener('click', closeGate);
  const pickPlan = (plan) => {
    if (plan !== 'standard' && !state.voicePlansEnabled) return;
    state.selectedPlan = plan;
    renderPrices();
  };
  for (const plan of PLANS) {
    const card = $(`card-${plan}`);
    card.addEventListener('click', () => pickPlan(plan));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pickPlan(plan);
      }
    });
  }
  $('voice-select').addEventListener('change', (e) => {
    stopAudio();
    state.voiceId = e.target.value;
  });
  $('add-voice-btn').addEventListener('click', openVoiceModal);
  $('close-voice').addEventListener('click', closeVoiceModal);
  $('record-btn').addEventListener('click', toggleRecording);
  $('voice-step1').addEventListener('submit', submitVoiceStep1);
  $('voice-relation').addEventListener('change', (e) => {
    $('voice-label-box').classList.toggle('hidden', e.target.value !== 'otro');
  });
  $('voice-back').addEventListener('click', () => {
    stopRecording(true);
    recorder.wav = null;
    $('record-preview').classList.add('hidden');
    $('voice-step2').classList.add('hidden');
    $('voice-step1').classList.remove('hidden');
    updateSaveVoice();
  });
  $('save-voice').addEventListener('click', saveVoice);
  $('gate-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (parseInt($('gate-answer').value, 10) !== gateResult) {
      $('gate-error').classList.remove('hidden');
      return;
    }
    const action = gateAction;
    closeGate();
    if (action) action();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('gate-modal').classList.contains('hidden')) closeGate();
    else if (!$('voice-modal').classList.contains('hidden')) closeVoiceModal();
    else if (!$('share-modal').classList.contains('hidden')) closeShare();
    else if (!$('paywall-modal').classList.contains('hidden')) closePaywall();
  });

  const audio = $('story-audio');
  audio.addEventListener('play', () => setAudioButton(true));
  audio.addEventListener('pause', () => setAudioButton(false));
  audio.addEventListener('ended', () => {
    audio.currentTime = 0;
    setAudioButton(false);
  });
  audio.addEventListener('error', () => {
    if (state.audioMode === 'file' && audio.getAttribute('src')) {
      state.audioMode = null;
      startSpeech();
    }
  });
}

state.profiles = readStore(PROFILES_KEY, []);
bind();
render();
loadMe().then(handleCheckoutReturn);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
