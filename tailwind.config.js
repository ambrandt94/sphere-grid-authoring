/** @type {import('tailwindcss').Config} */
const uiChannel = (name) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ui: {
          200: uiChannel('--ui-200'),
          300: uiChannel('--ui-300'),
          400: uiChannel('--ui-400'),
          500: uiChannel('--ui-500'),
          600: uiChannel('--ui-600'),
          700: uiChannel('--ui-700'),
          800: uiChannel('--ui-800'),
          900: uiChannel('--ui-900'),
          950: uiChannel('--ui-950'),
          accent: uiChannel('--ui-accent'),
          'accent-bright': uiChannel('--ui-accent-bright'),
          'accent-soft': uiChannel('--ui-accent-soft'),
          'accent-deep': uiChannel('--ui-accent-deep'),
          'accent-glow': uiChannel('--ui-accent-glow'),
          'on-accent': uiChannel('--ui-on-accent'),
        },
      },
      accentColor: {
        'ui-accent-bright': uiChannel('--ui-accent-bright'),
      },
    },
  },
  plugins: [],
}
