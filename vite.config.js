import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src', // Set the root directory to next/
  server: {
    port: 3000,
    open: true, // Open browser on server start
    watch: {
      usePolling: true, // Better HMR support across different environments
    },
  },
  build: {
    outDir: '../next', // Output to next directory in project root
    emptyOutDir: true, // Clean the output directory before build
  },
});
