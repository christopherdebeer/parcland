import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  root: 'src',
  server: {
    port: 3000,
    open: true, // Open browser on server start
    watch: {
      usePolling: true, // Better HMR support across different environments
    },
  },
  build: {
    minify: false, // Disable minification for easier debugging
    outDir: '../dist', // Output to next directory in project root
    emptyOutDir: true, // Clean the output directory before build
  },
});
