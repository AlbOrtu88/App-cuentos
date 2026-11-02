// Reglas de negocio compartidas por el Worker. El frontend recibe lo que necesita vía /api/me.

// Ritmo de lectura usado en todo el proyecto (palabras por minuto).
export const WPM = 125;

export const FREE_STORY_LIMIT = 3;

// Orden de los planes: un plan incluye todo lo de los anteriores.
export const PLAN_RANK = { free: 0, standard: 1, vip: 2 };

// Duraciones (minutos) y el plan mínimo que las desbloquea.
export const DURATIONS = { 2: 'free', 3: 'free', 5: 'standard', 10: 'vip' };

// Estilos de ilustración: id → prompt y plan mínimo.
export const STYLES = {
  watercolor: { plan: 'free', label: 'Acuarela suave', prompt: 'gentle watercolor storybook illustration, dreamy warm pastel palette, soft lighting' },
  pixar: { plan: 'standard', label: '3D Pixar', prompt: 'cute 3d animation style character render, cozy volumetric lighting' },
  vintage: { plan: 'standard', label: 'Cuento clásico', prompt: 'classic vintage golden book illustration, beatrix potter aesthetic, textured paper' },
  coloring: { plan: 'standard', label: 'Lámina para colorear', prompt: 'clean thick line coloring book page, black and white outline drawing, blank white background' },
  ghibli: { plan: 'vip', label: 'Anime Ghibli', prompt: 'soft hand-painted anime film background style, gentle pastel colors, whimsical' },
  clay: { plan: 'vip', label: 'Plastilina 3D', prompt: 'claymation stop motion style, handmade plasticine characters, soft studio light' },
  papercut: { plan: 'vip', label: 'Papel en capas', prompt: 'layered paper cut craft illustration, origami details, soft shadows between layers' },
  comic: { plan: 'vip', label: 'Cómic ilustrado', prompt: 'clean ligne claire comic illustration, flat soft colors, friendly characters' },
  felt: { plan: 'vip', label: 'Fieltro y lana', prompt: 'needle felted wool and felt puppets, cozy textile textures, warm light' },
  pencil: { plan: 'vip', label: 'Lápiz de color', prompt: 'colored pencil drawing on kraft paper, soft hatching, warm tones' },
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

// Voces de la familia (VIP): cuántas se pueden guardar por cuenta.
export const MAX_VOICES = 6;
