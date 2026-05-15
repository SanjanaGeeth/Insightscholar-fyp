module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        scholar: {
          50: '#eef2ff',
          100: '#dbe4ff',
          200: '#bac8ff',
          300: '#91a7ff',
          400: '#748ffc',
          500: '#5c7cfa',
          600: '#4c6ef5',
          700: '#4263eb',
          800: '#3b5bdb',
          900: '#364fc7',
          950: '#2b3fd4',
        },
        surface: {
          50: '#f0f4ff',
          100: '#e8efff',
          200: '#dce5f7',
          300: '#c5d1eb',
          400: '#9eaed0',
          500: '#7b8db5',
          600: '#5f7299',
          700: '#4a5a7d',
          800: '#364161',
          900: '#1e2a4a',
          950: '#141c33',
        },
        accent: {
          teal: '#20c997',
          amber: '#fcc419',
          coral: '#ff6b6b',
          violet: '#845ef7',
        }
      },
      fontFamily: {
        brand: ["'Tan Meringue'", 'Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glass': '0 8px 32px rgba(59, 91, 219, 0.08)',
        'glass-lg': '0 16px 48px rgba(59, 91, 219, 0.12)',
        'inner-glow': 'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        'card': '0 1px 3px rgba(59, 91, 219, 0.05), 0 6px 16px rgba(59, 91, 219, 0.04)',
        'card-hover': '0 4px 12px rgba(59, 91, 219, 0.08), 0 16px 32px rgba(59, 91, 219, 0.06)',
        'blue-glow': '0 4px 24px rgba(76, 110, 245, 0.25)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hero-mesh': 'linear-gradient(135deg, #3b5bdb 0%, #4c6ef5 50%, #5c7cfa 100%)',
        'hero-deep': 'linear-gradient(135deg, #2b3fd4 0%, #3b5bdb 40%, #5c7cfa 100%)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.4s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
