/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Vazirmatn', 'Tahoma', 'sans-serif'],
      },
      colors: {
        primary: '#00F2FF',
        black: '#000000',
        white: '#FFFFFF',
        surface: {
          DEFAULT: '#090C0D',
          feature: '#071012',
          card: '#0B1114',
          rail: '#111A1E',
          note: '#08090B',
        },
      },
    },
  },
  plugins: [],
}
