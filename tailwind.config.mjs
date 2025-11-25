/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        cyber: {
          void: '#0a0a0f',
          slate: '#1a1a2e',
          darkslate: '#16161d',
          cyan: '#00FFFF',
          purple: '#BC13FE',
          blue: '#00D9FF',
          pink: '#FF006E',
          green: '#39FF14',
        }
      },
      backdropBlur: {
        xs: '2px',
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans SC', 'sans-serif'],
        display: ['Rajdhani', 'Orbitron', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'fade-in': 'fadeIn 0.5s ease-in',
        'flicker': 'flicker 3s linear infinite',
        'scan-line': 'scanLine 8s linear infinite',
      },
      keyframes: {
        glowPulse: {
          '0%, 100%': { 
            boxShadow: '0 0 5px #00FFFF, 0 0 10px #00FFFF, 0 0 15px #00FFFF',
          },
          '50%': { 
            boxShadow: '0 0 10px #00FFFF, 0 0 20px #00FFFF, 0 0 30px #00FFFF, 0 0 40px #BC13FE',
          },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        flicker: {
          '0%, 19%, 21%, 23%, 25%, 54%, 56%, 100%': {
            opacity: '1',
          },
          '20%, 24%, 55%': {
            opacity: '0.4',
          },
        },
        scanLine: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
      },
      boxShadow: {
        'neon-cyan': '0 0 5px #00FFFF, 0 0 10px #00FFFF, 0 0 20px #00FFFF',
        'neon-purple': '0 0 5px #BC13FE, 0 0 10px #BC13FE, 0 0 20px #BC13FE',
        'neon-mix': '0 0 5px #00FFFF, 0 0 10px #BC13FE, 0 0 20px #00FFFF',
      },
    },
  },
  plugins: [],
}
