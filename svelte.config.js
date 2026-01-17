import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  // Consult https://svelte.dev/docs/kit/integrations
  // for more information about preprocessors
  preprocess: vitePreprocess(),

  // Svelte 5 options
  compilerOptions: {
    // Enable runes mode (Svelte 5)
    runes: true,
  },
};
