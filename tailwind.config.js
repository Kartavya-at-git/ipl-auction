/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ipl: {
          blue: '#192C70',
          gold: '#D1AB3E',
          red: '#ED1B24',
          navy: '#001D48',
          bg: '#0F172A',
        }
      }
    },
  },
  plugins: [],
}
