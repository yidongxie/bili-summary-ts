/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./web/index.html', './web/src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', '"SF Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        primary: '#0a0a0a',
        'on-primary': '#ffffff',
        'brand-green': '#00d4a4',
        'brand-green-deep': '#00b48a',
        'brand-green-soft': '#7cebcb',
        'brand-tag': '#3772cf',
        'brand-warn': '#c37d0d',
        'brand-error': '#d45656',
        canvas: '#ffffff',
        surface: '#f7f7f7',
        'surface-soft': '#fafafa',
        'surface-code': '#1c1c1e',
        hairline: '#e5e5e5',
        'hairline-soft': '#ededed',
        ink: '#0a0a0a',
        charcoal: '#1c1c1e',
        slate: '#3a3a3c',
        steel: '#5a5a5c',
        stone: '#888888',
        muted: '#a8a8aa',
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        xxl: '24px',
      },
    },
  },
  plugins: [],
};
