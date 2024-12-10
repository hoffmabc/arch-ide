import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@utils': path.resolve(__dirname, './src/lib/utils'),
      '@ui': path.resolve(__dirname, './src/components/ui'),
      '@hooks': path.resolve(__dirname, './src/hooks')
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'monaco-editor': ['@monaco-editor/react']
        }
      }
    }
  },
  optimizeDeps: {
    include: ['@monaco-editor/react']
  },
  server: {
    port: 3000
  }
});