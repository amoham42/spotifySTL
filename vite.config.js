import { defineConfig } from 'vite';

export default defineConfig({
  base: '/spotifySTL/',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          addons: ['three/addons']
        }
      }
    },
    chunkSizeWarningLimit: 1000
  }
});
