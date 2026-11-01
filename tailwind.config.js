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
      },
    },
  },
  plugins: [],
}
