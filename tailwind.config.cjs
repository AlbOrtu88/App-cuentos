/** @type {import('tailwindcss').Config} */
// Paleta «Lavanda y melocotón»: tonos ciruela muy oscuros, texto crema rosado
// (nunca blanco puro) y un único acento cálido para no espabilar a la hora de dormir.
module.exports = {
  content: ['./public/**/*.{html,js}'],
  theme: {
    extend: {
      colors: {
        // Fondos, tarjetas, bordes y textos
        noche: {
          50: '#FBF5F7',
          100: '#F1E4E8',
          200: '#E4D5DB',
          300: '#CDBDCB',
          400: '#B6A6BF',
          500: '#9D8DA8',
          600: '#7D6E8A',
          700: '#4A3D58',
          800: '#3A2F48',
          900: '#211A2C',
          950: '#17121F',
        },
        // Acento: botón principal, opción elegida y enlaces
        melocoton: {
          100: '#FCEADF',
          200: '#F9DCCB',
          300: '#F6C9B1',
          400: '#F4BD9F',
          500: '#F2B391',
          600: '#E0956F',
        },
        // Lo premium: voces de la familia, Pro y VIP
        lavanda: {
          200: '#DCCFF2',
          300: '#C3B0E8',
          400: '#A891DB',
          500: '#8F75CC',
        },
      },
    },
  },
  plugins: [],
};
