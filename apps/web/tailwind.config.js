/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm Hearth Dark palette
        hearth: {
          900: '#1A1614',  // bg-primary (body)
          800: '#231F1B',  // bg-secondary (cards, panels)
          700: '#2C2722',  // bg-tertiary (elevated)
          600: '#342E28',  // bg-surface (interactive)
          500: '#3D3631',  // bg-hover
        },

        // Text
        warm: {
          50:  '#F0EAE0',  // text-primary (warm off-white)
          200: '#B8AFA3',  // text-secondary (muted tan)
          400: '#7D7268',  // text-muted (warm gray)
          600: '#564E44',  // text-disabled (dim)
        },

        // Accents (muted, earthy)
        amber:    { DEFAULT: '#D4A55A', light: '#E0BB7A', dark: '#B88A3E' },
        sage:     { DEFAULT: '#8BA888', light: '#A3BDA0', dark: '#6E8E6B' },
        lavender: { DEFAULT: '#9488B2', light: '#ADA3C8', dark: '#776B98' },
        rose:     { DEFAULT: '#B47F8C', light: '#C99AA5', dark: '#966270' },
        clay:     { DEFAULT: '#A68B6B', light: '#BCA384', dark: '#8A7254' },

        // Status mapping
        locked:      '#5C5349',
        available:   '#D4A55A',
        in_progress: '#9488B2',
        mastered:    '#8BA888',

        // Borders
        'border-subtle':   '#332D27',
        'border-moderate': '#443D35',
        'border-strong':   '#554D43',

        // Semantic aliases (shadcn)
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        sm: '0.5rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.5rem',
        '2xl': '2rem',
        full: '9999px',
      },
      fontFamily: {
        heading: ['Fraunces', 'Georgia', 'serif'],
        body: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
        '5xl': ['3rem', { lineHeight: '1.15' }],
        '6xl': ['3.75rem', { lineHeight: '1.1' }],
        '7xl': ['4.5rem', { lineHeight: '1.05' }],
      },
      boxShadow: {
        sm: '0 1px 3px rgba(0,0,0,0.4)',
        md: '0 4px 12px rgba(0,0,0,0.4)',
        lg: '0 12px 32px rgba(0,0,0,0.5)',
        xl: '0 20px 48px rgba(0,0,0,0.5)',
        inner: 'inset 0 2px 4px rgba(0,0,0,0.3)',
        'glow-amber':    '0 0 24px rgba(212,165,90,0.15)',
        'glow-sage':     '0 0 24px rgba(139,168,136,0.15)',
        'glow-lavender': '0 0 24px rgba(148,136,178,0.15)',
        'glow-rose':     '0 0 24px rgba(180,127,140,0.15)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      animation: {
        shimmer: 'shimmer 2s ease-in-out infinite',
        'fade-up': 'fade-up 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'scale-in': 'scale-in 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'slide-in-right': 'slide-in-right 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-out-right': 'slide-out-right 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        'breathe': 'breathe 4s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'slide-out-right': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'breathe': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
