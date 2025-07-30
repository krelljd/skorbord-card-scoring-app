/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // Extend with custom animations for better mobile experience
      animation: {
        'fade-in-25': 'fadeIn 0.3s ease-out',
        'zoom-in-95': 'zoomIn 0.3s ease-out',
        'score-tally': 'scoreTallyLifecycle 3s ease-in-out forwards'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        zoomIn: {
          '0%': { transform: 'scale(0.95)' },
          '100%': { transform: 'scale(1)' }
        },
        scoreTallyLifecycle: {
          '0%': { 
            opacity: '0', 
            transform: 'translateY(-8px) scale(0.8)'
          },
          '15%': { 
            opacity: '1', 
            transform: 'translateY(0) scale(1.05)'
          },
          '20%': { 
            opacity: '1', 
            transform: 'translateY(0) scale(1)'
          },
          '85%': { 
            opacity: '1', 
            transform: 'translateY(0) scale(1)'
          },
          '100%': { 
            opacity: '0', 
            transform: 'translateY(-8px) scale(0.9)'
          }
        }
      },
      // Mobile-first spacing scale
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)'
      },
      // Improved touch target sizes
      minHeight: {
        'touch': '44px'
      },
      minWidth: {
        'touch': '44px'
      }
    }
  },
  plugins: [
    require('daisyui'),
    require('@tailwindcss/container-queries'),
    // Add custom plugin for touch optimization
    function({ addUtilities }) {
      addUtilities({
        '.touch-manipulation': {
          'touch-action': 'manipulation'
        },
        '.mobile-optimized': {
          'min-height': '100dvh',
          'padding-top': 'env(safe-area-inset-top)',
          'padding-bottom': 'env(safe-area-inset-bottom)'
        }
      })
    }
  ],
  daisyui: {
    themes: [
      {
        light: {
          "primary": "#3b82f6",
          "primary-content": "#ffffff",
          "secondary": "#6366f1", 
          "secondary-content": "#ffffff",
          "accent": "#06b6d4",
          "accent-content": "#ffffff",
          "neutral": "#374151",
          "neutral-content": "#ffffff",
          "base-100": "#ffffff",
          "base-200": "#f3f4f6",
          "base-300": "#e5e7eb",
          "base-content": "#1f2937",
          "info": "#0ea5e9",
          "info-content": "#ffffff",
          "success": "#10b981",
          "success-content": "#ffffff",
          "warning": "#f59e0b",
          "warning-content": "#ffffff",
          "error": "#ef4444",
          "error-content": "#ffffff"
        }
      },
      {
        dark: {
          "primary": "#60a5fa",
          "primary-content": "#1e3a8a",
          "secondary": "#818cf8",
          "secondary-content": "#312e81",
          "accent": "#06b6d4",
          "accent-content": "#0c4a6e",
          "neutral": "#1f2937",
          "neutral-content": "#d1d5db",
          "base-100": "#111827",
          "base-200": "#1f2937",
          "base-300": "#374151",
          "base-content": "#f9fafb",
          "info": "#0ea5e9",
          "info-content": "#075985",
          "success": "#10b981",
          "success-content": "#064e3b",
          "warning": "#f59e0b",
          "warning-content": "#92400e",
          "error": "#ef4444",
          "error-content": "#7f1d1d"
        }
      }
    ],
    base: true,
    styled: true,
    utils: true,
    logs: false
  }
}
