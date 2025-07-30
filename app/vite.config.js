/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()  // New Tailwind CSS v4 Vite plugin
  ],
  server: {
    port: 2424,
    host: true,
    strictPort: false,
    cors: true,
    proxy: {
      '/api': {
        target: 'http://localhost:2525',
        changeOrigin: true,
        secure: false,
        timeout: 10000,
        proxyTimeout: 10000
      },
      '/socket.io': {
        target: 'http://localhost:2525',
        changeOrigin: true,
        secure: false,
        ws: true,
        rewrite: (path) => path,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('Proxy error:', err)
          })
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Sending Request to the Target:', req.method, req.url)
          })
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url)
          })
          proxy.on('upgrade', (req, socket, head) => {
            console.log('Upgrading connection for:', req.url)
          })
        }
      }
    }
  },
  preview: {
    port: 2424,
    host: true,
    strictPort: false,
    cors: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          socket: ['socket.io-client']
        }
      }
    }
  },
  define: {
    __API_URL__: JSON.stringify(process.env.NODE_ENV === 'production' ? 'https://cards.skorbord.app' : 'http://localhost:2525')
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
      ],
    },
  },
})
