import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      'tool-db': path.resolve(__dirname, '../tool-db/packages/tool-db/dist/index.js'),
      '@tool-db/webrtc-network': path.resolve(__dirname, '../tool-db/packages/webrtc-network/dist/index.js'),
      '@tool-db/indexeddb-store': path.resolve(__dirname, '../tool-db/packages/indexeddb-store/dist/index.js'),
      '@tool-db/ecdsa-user': path.resolve(__dirname, '../tool-db/packages/ecdsa-user/dist/index.js'),
    },
  },
  optimizeDeps: {
    include: [
      'tool-db',
      '@tool-db/webrtc-network',
      '@tool-db/indexeddb-store',
      '@tool-db/ecdsa-user',
      'simple-peer',
    ],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
})
