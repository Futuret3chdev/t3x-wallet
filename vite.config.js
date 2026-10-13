import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      include: ['buffer', 'crypto', 'stream', 'process'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  assetsInclude: ['**/*.wasm'],
  resolve: {
    alias: {
      'buffer': 'buffer',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  optimizeDeps: {
    include: ['bip39', 'buffer'],
  },
});
