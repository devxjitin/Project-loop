import type { Config } from 'tailwindcss';
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#eff6ff', 100: '#dbeafe', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' },
        surface: { muted: '#f8fafc', border: '#e2e8f0' },
      },
      borderRadius: { panel: '1rem' },
      boxShadow: { panel: '0 8px 25px rgba(15, 23, 42, 0.04)' },
    },
  },
  plugins: [],
} satisfies Config;
