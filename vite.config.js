import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  base: './', // Ensure assets use relative paths
  // server: {
  //   proxy: {
  //     '/sparql': {
  //       target: 'https://endpoint-with-cors/sparql',
  //       changeOrigin: true,
  //       secure: false,
  //       rewrite: (path) => path.replace(/^\/sparql/, '')
  //     },
  //   },
  // },
  plugins: [
    nodePolyfills({
      include: ['path', 'stream', 'util'], exclude: ['http'], globals: {
        Buffer: true, global: true, process: true,
      }, overrides: {
        fs: 'memfs',
      }, protocolImports: true,
    })],
})

