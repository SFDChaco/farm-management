/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        farm: {
          bg: '#0a0f0a',
          card: '#131a13',
          border: '#1e2e1e',
          green: '#4ADE80',
          greenDim: '#22543d',
          amber: '#FBBF24',
          red: '#EF4444',
          blue: '#60A5FA',
          cyan: '#22D3EE',
          purple: '#A855F7',
        }
      },
      fontFamily: {
        display: ['"Source Serif 4"', 'serif'],
        body: ['Outfit', 'sans-serif'],
      }
    },
  },
  plugins: [],
};
