import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],

  // Path aliases
  resolve: {
    alias: {
      $lib: path.resolve('./src/lib'),
      $stores: path.resolve('./src/lib/stores'),
      $api: path.resolve('./src/lib/api'),
      $utils: path.resolve('./src/lib/utils'),
    },
  },

  // Vite options tailored for Tauri development
  clearScreen: false,

  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Tell Vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },

  // Build options for production
  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS/Linux
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari14',
    // Don't minify for debug builds
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    // Produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    // Output directory
    outDir: 'dist',
  },

  // Prevent Vite from obscuring Rust errors
  envPrefix: ['VITE_', 'TAURI_ENV_'],
});
