/** @type {import('tailwindcss').Config} */
// Paleta de día cálida, como las ilustraciones en acuarela de la app:
// papel crema, tinta azul marino, terracota de maceta y lavanda para lo premium.
// La escala «papel» va al revés que las de Tailwind: 950 es el fondo más claro y 50 el texto más oscuro,
// así las clases de fondo (bg-papel-950) y de texto (text-papel-100) siguen teniendo sentido.
module.exports = {
  content: ['./public/**/*.{html,js}'],
  theme: {
    extend: {
      colors: {
        papel: {
          50: '#1F2A6B',  // títulos, azul marino
          100: '#2B2635', // texto principal
          200: '#3F352B', // texto del cuento
          300: '#4E4337',
          400: '#6B5D4C', // texto secundario
          500: '#7A6B58', // texto pequeño y apagado
          600: '#9A8C78', // marcadores de posición
          700: '#D9CBB0',
          800: '#EADFC8', // bordes
          900: '#FFFBF2', // tarjetas
          950: '#FBF5E8', // fondo
        },
        // Acento: botón principal, opción elegida y enlaces (oscuro para leerse sobre crema)
        terracota: {
          100: '#6A3119',
          200: '#7A3A1E',
          300: '#8E4526',
          400: '#9A4A28', // hover del botón
          500: '#A9532E', // botón principal
          600: '#C9714B',
        },
        // Lo premium: voces de la familia, Pro y VIP
        lavanda: {
          200: '#5B3F8F',
          300: '#6A4C9E',
          400: '#7457A8',
          500: '#8466B8',
        },
      },
    },
  },
  plugins: [],
};
