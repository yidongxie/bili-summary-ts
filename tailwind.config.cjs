/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./web/index.html', './web/src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        ink: '#0d2d45',
        muted: '#5b8fae',
        soft: '#7db8d4',
        primary: {
          DEFAULT: '#0ea5e9',
          dark: '#0284c7',
          deep: '#0369a1',
        },
        accent: '#38bdf8',
      },
    },
  },
  plugins: [],
};
