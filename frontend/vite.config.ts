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
    port: 3000,
    proxy: {
      '/api/bitcoin': {
        target: 'http://bitcoin-node.dev.aws.archnetwork.xyz:18443',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/bitcoin/, ''),
        headers: {
          'Authorization': `Basic ${Buffer.from('bitcoin:428bae8f3c94f8c39c50757fc89c39bc7e6ebc70ebf8f618').toString('base64')}`
        }
      }
    }
  }
});