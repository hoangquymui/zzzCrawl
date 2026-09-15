/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        highlightPulse: {
          '0%': { backgroundColor: 'rgba(59, 130, 246, 0.3)' },
          '100%': { backgroundColor: 'transparent' },
        },
      },
      animation: {
        'row-pulse': 'highlightPulse 2.5s ease-out',
      },
    },
  },
  plugins: [],
};
