import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  base: '/sw33t/',
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
      // bittorrent-dht is Node.js only, provide empty shim for browser
      'bittorrent-dht': './src/shims/empty.js',
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
