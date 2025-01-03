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
  define: {
    global: 'globalThis',
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
    include: ['@monaco-editor/react', 'buffer']
  },
  server: {
    port: 3000,
    proxy: {
      '/rpc': {
        target: 'http://localhost:9002',
        changeOrigin: true,
        secure: false
      },
      '/api/bitcoin': {
        target: 'http://localhost:8010/proxy',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => {
          const url = new URL(path, 'http://localhost:8010');
          const wallet = url.searchParams.get('wallet');
          return wallet ? `/proxy/wallet/${wallet}` : '/proxy';
        },
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            const auth = Buffer.from('bitcoin:428bae8f3c94f8c39c50757fc89c39bc7e6ebc70ebf8f618').toString('base64');
            proxyReq.setHeader('Authorization', `Basic ${auth}`);
          });
        }
      }
    }
  }
});