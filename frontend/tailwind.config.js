/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary': 'var(--bg-primary)',
        'bg-secondary': 'var(--bg-secondary)',
        'bg-elevated': 'var(--bg-elevated)',
        'bg-glass': 'var(--bg-glass)',
        'accent-primary': 'var(--accent-primary)',
        'accent-glow': 'var(--accent-glow)',
        'accent-amber': 'var(--accent-amber)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        'border-subtle': 'var(--border-subtle)',
        'border-glow': 'var(--border-glow)',
        'mood-calm': 'var(--mood-calm)',
        'mood-happy': 'var(--mood-happy)',
        'mood-focused': 'var(--mood-focused)',
        'mood-stressed': 'var(--mood-stressed)',
        'mood-excited': 'var(--mood-excited)',
        'mood-neutral': 'var(--mood-neutral)',
        'message-sent': 'var(--message-sent)',
        'message-received': 'var(--message-received)',
        'danger': 'var(--danger)',
        'success': 'var(--success)'
      },
      fontFamily: {
        heading: ['var(--font-heading)'],
        mono: ['var(--font-mono)'],
        body: ['var(--font-body)'],
      },
      borderRadius: {
        'sm': 'var(--radius-sm)',
        'md': 'var(--radius-md)',
        'lg': 'var(--radius-lg)',
        'xl': 'var(--radius-xl)',
      },
      keyframes: {
        pulseBreathe: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.8' },
          '50%': { transform: 'scale(1.04)', opacity: '1' },
        },
        waveBounce: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        slideUpFade: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmerWave: {
          '0%': { backgroundPosition: '200% center' },
          '100%': { backgroundPosition: '-200% center' },
        },
      },
      animation: {
        pulseBreathe: 'pulseBreathe 3s ease-in-out infinite',
        waveBounce: 'waveBounce 1.2s ease-in-out infinite',
        slideUpFade: 'slideUpFade 0.3s ease forwards',
        shimmerWave: 'shimmerWave 3s linear infinite',
      },
    },
  },
  plugins: [],
}
