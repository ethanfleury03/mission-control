/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        hub: {
          border: 'rgba(34, 211, 238, 0.12)',
          glow: 'rgba(34, 211, 238, 0.08)',
        },
        bg: {
          primary: '#070b12',
          secondary: '#0d121c',
          tertiary: '#141b2a',
          hover: '#1c2638',
        },
        accent: {
          cyan: '#22d3ee',
          green: '#22c55e',
          yellow: '#eab308',
          red: '#ef4444',
          purple: '#a855f7',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': '0.625rem',
      },
      spacing: {
        'sidebar-left': '260px',
        'sidebar-right': '300px',
        'header': '56px',
        'bottom-bar': '48px',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'slide-in': 'slide-in 0.2s ease-out',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 5px rgba(34, 211, 238, 0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(34, 211, 238, 0.6)' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateX(-10px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}
