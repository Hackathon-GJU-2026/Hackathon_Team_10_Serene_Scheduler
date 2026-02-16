import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  
  // Production deployment configuration
  base: './',
  
  // Build configuration for Flask integration
  build: {
    outDir: 'build',           // Output directory for built files
    assetsDir: 'static',       // Static assets directory
    emptyOutDir: true,         // Clean output directory before build
    sourcemap: false,          // Disable sourcemaps for production
    
    // Optimize build for production
    rollupOptions: {
      output: {
        // Organize chunks for better caching
        manualChunks: {
          vendor: ['react', 'react-dom'],
        }
      }
    }
  },
  
  // Development server configuration
  server: {
    port: 5173,
    host: true,                // Listen on all addresses
    
    // Proxy API requests to Flask backend during development
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false
      }
    }
  },
  
  // Preview server configuration (for testing production build)
  preview: {
    port: 4173,
    host: true
  }
})