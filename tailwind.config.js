/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'glass': {
          'light': 'rgba(255, 255, 255, 0.7)',
          'dark': 'rgba(30, 30, 30, 0.7)',
          'border': 'rgba(255, 255, 255, 0.2)',
        },
        'accent': {
          'blue': '#007AFF',
          'green': '#34C759',
          'red': '#FF3B30',
          'orange': '#FF9500',
          'yellow': '#FFCC00',
        }
      },
      backdropBlur: {
        'xs': '2px',
      },
      boxShadow: {
        'glass': '0 4px 30px rgba(0, 0, 0, 0.1)',
        'glass-hover': '0 8px 30px rgba(0, 0, 0, 0.15)',
      }
    },
  },
  plugins: [],
}