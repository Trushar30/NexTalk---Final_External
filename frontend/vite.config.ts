import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import path from "path"

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // Only use basicSsl in development (Vercel provides HTTPS in production)
    ...(mode === 'development' ? [basicSsl()] : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    https: {},
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    // Production optimizations
    target: 'es2020',
    sourcemap: false,
    // esbuild is built-in and faster than terser — no extra dependency needed
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // Code splitting for better caching
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          state: ['zustand', '@tanstack/react-query'],
          realtime: ['socket.io-client'],
          animation: ['framer-motion', 'gsap'],
        },
      },
    },
    // Chunk size warning threshold
    chunkSizeWarningLimit: 500,
  },
  // esbuild options for production
  esbuild: mode === 'production' ? {
    drop: ['console', 'debugger'],
  } : undefined,
}))
