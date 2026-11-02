// Cuentos Mágicos: lógica del navegador. Todo lo que cuesta dinero pasa por el Worker (/api/...).
'use strict';

const WPM = 125;
const PLAN_RANK = { free: 0, standard: 1, vip: 2 };

// Deben coincidir con src/config.js (el servidor es quien manda; esto solo pinta la interfaz).
const DURATIONS = [
  { min: 2, plan: 'free' },
  { min: 3, plan: 'free' },
  { min: 5, plan: 'standard' },
  { min: 10, plan: 'vip' },
];
const STYLES = [
  { id: 'watercolor', plan: 'free', label: 'Acuarela suave' },
  { id: 'pixar', plan: 'standard', label: '3D Pixar' },
  { id: 'vintage', plan: 'standard', label: 'Cuento clásico' },
  { id: 'coloring', plan: 'standard', label: 'Lámina para colorear' },
  { id: 'ghibli', plan: 'vip', label: 'Anime Ghibli' },
  { id: 'clay', plan: 'vip', label: 'Plastilina 3D' },
  { id: 'papercut', plan: 'vip', label: 'Papel en capas' },
  { id: 'comic', plan: 'vip', label: 'Cómic ilustrado' },
  { id: 'felt', plan: 'vip', label: 'Fieltro y lana' },
  { id: 'pencil', plan: 'vip', label: 'Lápiz de color' },
];
const VOICE_PRESETS = ['Papá', 'Mamá', 'Abuelo', 'Abuela', 'Tío', 'Tía'];

const PRICES = {
  annual: {
    std: { price: '3,33 €<span class="text-xs font-normal text-slate-400">/mes</span>', sub: 'Se factura 39,99 € al año' },
    vip: { price: '10,00 €<span class="text-xs font-normal text-slate-400">/mes</span>', sub: 'Se factura 119,99 € al año' },
    cta: { standard: 'Después 39,99 € al año', vip: 'Después 119,99 € al año' },
  },
  monthly: {
    std: { price: '4,99 €<span class="text-xs font-normal text-slate-400">/mes</span>', sub: 'Se factura cada mes' },
    vip: { price: '14,99 €<span class="text-xs font-normal text-slate-400">/mes</span>', sub: 'Se factura cada mes' },
    cta: { standard: 'Después 4,99 € al mes', vip: 'Después 14,99 € al mes' },
  },
};
const PLAN_NAMES = { standard: 'Estándar', vip: 'VIP' };

const state = {
  plan: 'free',
  freeRemaining: 3,
  hasBilling: false,
  duration: 3,
  styleId: 'watercolor',
  billing: 'annual',
  selectedPlan: 'standard',
  vipEnabled: false,
  voices: [],
  maxVoices: 6,
  voiceId: '',
  story: null,
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
  state.vipEnabled = Boolean(data.vipEnabled);
  state.voices = data.voices || [];
  state.maxVoices = data.maxVoices || 6;
  render();
}

// ---------- Interfaz ----------

const allows = (required) => PLAN_RANK[state.plan] >= PLAN_RANK[required];

function render() {
  renderQuota();
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
    badge.classList.add('bg-amber-500/10', 'text-amber-300', 'border-amber-500/30');
  } else {
    badge.textContent = 'Has usado tus 3 cuentos gratis';
    badge.classList.add('bg-rose-500/10', 'text-rose-300', 'border-rose-500/30');
  }
}

function lockLabel(plan) {
  return plan === 'vip' ? '👑' : '⭐';
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
      if (locked) return openPaywall(d.plan === 'vip' ? 'Los cuentos de 10 minutos están en el plan VIP.' : 'Los cuentos de 5 minutos están en el plan Estándar.', d.plan);
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
      if (locked) return openPaywall(s.plan === 'vip' ? 'Este estilo está en el plan VIP.' : 'Este estilo está en el plan Estándar.', s.plan);
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

function showStory(story) {
  state.story = story;
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
  $('creator-view').classList.add('hidden');
  $('reader-view').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeReader() {
  stopAudio();
  $('reader-view').classList.add('hidden');
  $('creator-view').classList.remove('hidden');
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
  const show = state.plan === 'vip' && state.voices.length > 0;
  select.classList.toggle('hidden', !show);
  select.innerHTML = '';
  const options = [{ id: '', name: 'Narrador' }, ...state.voices];
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
    setAudioButton(false, true);
    try {
      const { ok, data } = await api(`/api/story/${state.story.id}/audio`, {
        method: 'POST',
        body: JSON.stringify({ voiceId: state.voiceId || undefined }),
      });
      if (ok && data.audioUrl) {
        state.audioMode = 'file';
        audio.src = data.audioUrl;
        await audio.play();
        return;
      }
      if (state.voiceId) {
        // Si la voz de la familia falla, no se sustituye en silencio por la del móvil.
        setAudioButton(false);
        const known = data.error && data.code !== 'no_tts';
        return toast(known ? data.error : 'La voz de la familia no está disponible ahora. Prueba con el narrador.');
      }
      if (data.error && data.code !== 'no_tts') toast(data.error);
    } catch {
      if (state.voiceId) {
        setAudioButton(false);
        return toast('Sin conexión. Inténtalo de nuevo.');
      }
    }
  }
  startSpeech();
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
    p.classList.toggle('bg-amber-400/10', Number(p.dataset.index) === index);
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

// ---------- Voces de la familia (VIP) ----------

function renderVoices() {
  const list = $('voices-list');
  list.innerHTML = '';
  for (const v of state.voices) {
    const li = document.createElement('li');
    li.className = 'flex items-center gap-1 bg-purple-500/10 border border-purple-500/30 text-purple-200 text-xs rounded-full pl-3 pr-1 py-0.5';
    const name = document.createElement('span');
    name.textContent = v.name;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'px-1.5 text-purple-300 hover:text-rose-300';
    del.setAttribute('aria-label', `Borrar la voz de ${v.name}`);
    del.textContent = '✕';
    del.addEventListener('click', () => deleteVoice(v));
    li.append(name, del);
    list.appendChild(li);
  }
  $('voices-empty').classList.toggle('hidden', state.voices.length > 0);
  $('add-voice-btn').classList.toggle('hidden', state.plan === 'vip' && state.voices.length >= state.maxVoices);
}

async function deleteVoice(v) {
  if (!confirm(`¿Borrar la voz de ${v.name}? Se borrarán también los cuentos narrados con ella.`)) return;
  const { ok, data } = await api(`/api/voices/${v.id}`, { method: 'DELETE' });
  if (!ok) return toast(data.error || 'No se pudo borrar la voz.');
  state.voices = data.voices;
  renderVoices();
  toast('Voz borrada.');
}

const recorder = { media: null, stream: null, chunks: [], wav: null, timer: null, started: 0 };

function openVoiceModal() {
  if (state.plan !== 'vip') {
    return openPaywall('Graba a papá, mamá o los abuelos y que lean el cuento con su voz. Está en el plan VIP.', 'vip');
  }
  const presets = $('voice-presets');
  presets.innerHTML = '';
  const taken = new Set(state.voices.map((v) => v.name.toLowerCase()));
  for (const name of VOICE_PRESETS) {
    if (taken.has(name.toLowerCase())) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'option-btn';
    btn.textContent = name;
    btn.addEventListener('click', () => {
      $('voice-name').value = name;
      presets.querySelectorAll('button').forEach((b) => b.classList.toggle('option-btn-active', b === btn));
      updateSaveVoice();
    });
    presets.appendChild(btn);
  }
  $('voice-name').value = '';
  $('voice-consent').checked = false;
  $('voice-error').classList.add('hidden');
  $('record-preview').classList.add('hidden');
  $('record-time').textContent = '0 s';
  recorder.wav = null;
  updateSaveVoice();
  $('voice-modal').classList.remove('hidden');
}

function closeVoiceModal() {
  stopRecording(true);
  $('voice-modal').classList.add('hidden');
}

function updateSaveVoice() {
  $('save-voice').disabled = !(recorder.wav && $('voice-name').value.trim() && $('voice-consent').checked);
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
    if (secs >= 30) stopRecording();
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
  if (secs < 10) {
    updateSaveVoice();
    return showVoiceError('Graba al menos 10 segundos (mejor unos 20) para que la voz se parezca.');
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
  const name = $('voice-name').value.trim();
  const btn = $('save-voice');
  btn.disabled = true;
  btn.textContent = 'Guardando...';
  try {
    const res = await fetch(`/api/voices?consent=1&name=${encodeURIComponent(name)}`, {
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
    toast(`Voz de ${name} guardada. Elígela al escuchar un cuento.`);
  } catch {
    showVoiceError('Sin conexión. Inténtalo de nuevo.');
  } finally {
    btn.textContent = 'Guardar voz';
    updateSaveVoice();
  }
}

// ---------- Suscripción ----------

function openPaywall(reason, plan) {
  if (plan === 'vip' && state.vipEnabled) state.selectedPlan = 'vip';
  $('paywall-reason').textContent = reason || 'Cuentos ilimitados, narrados con voz natural y con valores.';
  $('checkout-error').classList.add('hidden');
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
  $('price-std').innerHTML = p.std.price;
  $('subtext-std').textContent = p.std.sub;
  $('price-vip').innerHTML = p.vip.price;
  $('subtext-vip').textContent = p.vip.sub;
  if (!state.vipEnabled) state.selectedPlan = 'standard';
  $('cta-subtext').textContent = p.cta[state.selectedPlan];
  $('cta-title').textContent = state.selectedPlan === 'vip' ? 'Probar VIP 3 días gratis' : 'Probar 3 días gratis';
  $('card-standard').classList.toggle('plan-card-active', state.selectedPlan === 'standard');
  $('card-vip').classList.toggle('plan-card-active', state.selectedPlan === 'vip');
  $('card-vip').classList.toggle('plan-card-disabled', !state.vipEnabled);
  $('card-vip').setAttribute('aria-disabled', String(!state.vipEnabled));
  $('vip-badge').textContent = state.vipEnabled ? 'Voces de la familia' : 'Próximamente';
  $('btn-period-annual').classList.toggle('period-btn-active', state.billing === 'annual');
  $('btn-period-monthly').classList.toggle('period-btn-active', state.billing === 'monthly');
}

// Control parental: una suma sencilla antes de ir al pago o al portal.
let gateAction = null;
let gateResult = 0;

function askAdult(action) {
  const a = 6 + Math.floor(Math.random() * 7);
  const b = 4 + Math.floor(Math.random() * 6);
  gateResult = a * b;
  gateAction = action;
  $('gate-question').textContent = `¿Cuánto es ${a} × ${b}?`;
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
      body: JSON.stringify({ plan: state.selectedPlan, billing: state.billing }),
    });
    if (ok && data.url) {
      window.location.href = data.url;
      return;
    }
    showCheckoutError(data.error || 'No se pudo abrir el pago.');
  } catch {
    showCheckoutError('Sin conexión. Inténtalo de nuevo.');
  } finally {
    btn.disabled = false;
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
  $('manage-btn').addEventListener('click', () => askAdult(openPortal));
  $('gate-cancel').addEventListener('click', closeGate);
  const pickPlan = (plan) => {
    if (plan === 'vip' && !state.vipEnabled) return;
    state.selectedPlan = plan;
    renderPrices();
  };
  for (const plan of ['standard', 'vip']) {
    const card = $(plan === 'vip' ? 'card-vip' : 'card-standard');
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
  $('voice-name').addEventListener('input', updateSaveVoice);
  $('voice-consent').addEventListener('change', updateSaveVoice);
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

bind();
render();
loadMe().then(handleCheckoutReturn);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
