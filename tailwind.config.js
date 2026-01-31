/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        timeline: {
          bg: '#fafafa',
          grid: '#e5e7eb',
          gridDark: '#d1d5db',
          today: '#ef4444',
        },
      },
    },
  },
  plugins: [],
};
