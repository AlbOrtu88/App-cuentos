// Página que abren los abuelos desde el enlace: muestra el cuento y su audio. Sin cookies.
'use strict';

(async () => {
  const $ = (id) => document.getElementById(id);
  const token = (location.pathname.match(/^\/c\/([a-f0-9]{32})$/) || [])[1];
  const fail = (msg) => {
    $('shared-loading').classList.add('hidden');
    $('shared-error').textContent = msg;
    $('shared-error').classList.remove('hidden');
  };
  if (!token) return fail('Este enlace no es válido.');

  let data;
  try {
    const res = await fetch(`/api/shared/${token}`, { credentials: 'omit' });
    data = await res.json();
    if (!res.ok) return fail(data.error || 'Este enlace ya no está activo.');
  } catch {
    return fail('No hay conexión. Inténtalo de nuevo en un momento.');
  }

  document.title = `${data.titulo} · Cuentacasa`;
  $('shared-title').textContent = data.titulo;
  for (const text of data.parrafos) {
    const p = document.createElement('p');
    p.textContent = text;
    $('shared-content').appendChild(p);
  }
  if (data.imageUrl) {
    $('shared-image').src = data.imageUrl;
    $('shared-image-box').classList.remove('hidden');
  }
  if (data.audioUrl) {
    const audio = $('shared-audio');
    audio.src = data.audioUrl;
    const play = $('shared-play');
    play.classList.remove('hidden');
    play.addEventListener('click', () => {
      play.classList.add('hidden');
      audio.classList.remove('hidden');
      audio.play().catch(() => {});
    });
  }
  $('shared-loading').classList.add('hidden');
  $('shared-story').classList.remove('hidden');
})();
