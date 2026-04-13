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
        brand: {
          DEFAULT: '#C41E3A',
          hover: '#a01830',
          muted: 'rgba(196, 30, 58, 0.12)',
        },
        hub: {
          border: 'rgba(0, 0, 0, 0.08)',
          glow: 'rgba(196, 30, 58, 0.12)',
        },
        bg: {
          primary: '#f4f4f5',
          secondary: '#ffffff',
          tertiary: '#ebebec',
          hover: '#e4e4e6',
        },
        text: {
          primary: '#0a0a0a',
          secondary: '#404040',
          muted: '#737373',
        },
        accent: {
          // Primary interactive accent = Arrow Systems red (maps legacy `accent-cyan` usages to brand red)
          cyan: '#C41E3A',
          green: '#15803d',
          yellow: '#a16207',
          red: '#b91c1c',
          purple: '#6b21a8',
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
        header: '56px',
        'bottom-bar': '48px',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'slide-in': 'slide-in 0.2s ease-out',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 5px rgba(196, 30, 58, 0.25)' },
          '50%': { boxShadow: '0 0 20px rgba(196, 30, 58, 0.45)' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateX(-10px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
};
