// Reglas de negocio compartidas por el Worker. El frontend recibe lo que necesita vía /api/me.

// Ritmo de lectura usado en todo el proyecto (palabras por minuto).
export const WPM = 125;

export const FREE_STORY_LIMIT = 3;

// Orden de los planes: un plan incluye todo lo de los anteriores.
export const PLAN_RANK = { free: 0, standard: 1, pro: 2, vip: 3 };

export const PAID_PLANS = ['standard', 'pro', 'vip'];

// Duraciones (minutos) y el plan mínimo que las desbloquea.
export const DURATIONS = { 2: 'free', 3: 'free', 5: 'standard', 10: 'pro' };

// Estilos de ilustración: id → prompt y plan mínimo.
export const STYLES = {
  watercolor: { plan: 'free', label: 'Acuarela suave', prompt: 'gentle watercolor storybook illustration, dreamy warm pastel palette, soft lighting' },
  pixar: { plan: 'standard', label: '3D Pixar', prompt: 'cute 3d animation style character render, cozy volumetric lighting' },
  vintage: { plan: 'standard', label: 'Cuento clásico', prompt: 'classic vintage golden book illustration, beatrix potter aesthetic, textured paper' },
  coloring: { plan: 'standard', label: 'Lámina para colorear', prompt: 'clean thick line coloring book page, black and white outline drawing, blank white background' },
  ghibli: { plan: 'pro', label: 'Anime Ghibli', prompt: 'soft hand-painted anime film background style, gentle pastel colors, whimsical' },
  clay: { plan: 'pro', label: 'Plastilina 3D', prompt: 'claymation stop motion style, handmade plasticine characters, soft studio light' },
  papercut: { plan: 'pro', label: 'Papel en capas', prompt: 'layered paper cut craft illustration, origami details, soft shadows between layers' },
  comic: { plan: 'pro', label: 'Cómic ilustrado', prompt: 'clean ligne claire comic illustration, flat soft colors, friendly characters' },
  felt: { plan: 'pro', label: 'Fieltro y lana', prompt: 'needle felted wool and felt puppets, cozy textile textures, warm light' },
  pencil: { plan: 'pro', label: 'Lápiz de color', prompt: 'colored pencil drawing on kraft paper, soft hatching, warm tones' },
};

// Moralejas: id → texto que se pasa al modelo.
export const LESSONS = {
  dark: 'Perder el miedo a la oscuridad y sentir seguridad',
  share: 'Compartir juguetes y ser generoso con los demás',
  patience: 'Tener paciencia cuando las cosas tardan un poco',
  kindness: 'Ser amable, empático y hacer nuevos amigos',
  gratitude: 'Agradecer las cosas bonitas que pasaron hoy',
};

export function planAllows(userPlan, requiredPlan) {
  return (PLAN_RANK[userPlan] ?? 0) >= (PLAN_RANK[requiredPlan] ?? 99);
}

export function targetWords(minutes) {
  return minutes * WPM;
}

// Un minuto de narración son unos 760 caracteres (125 palabras).
const MIN = 760;

// Límites de voz al mes por plan (en caracteres). VIP comparte un total entre narrador y voces.
export const PLAN_LIMITS = {
  free: { narrChars: 0, cloneChars: 0, voices: 0 },
  standard: { narrChars: 60 * MIN, cloneChars: 0, voices: 0 },
  pro: { narrChars: 150 * MIN, cloneChars: 20 * MIN, voices: 1 },
  vip: { narrChars: 200 * MIN, cloneChars: 120 * MIN, voices: 6, totalChars: 200 * MIN },
};

// Máximo de voces de la familia que se pueden guardar (el del plan VIP).
export const MAX_VOICES = 6;

export function limitsFor(plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}
