import { defineConfig } from 'vite';

// Relative base so the production build also works when served from a subpath
// or opened via a static file host.
export default defineConfig({
  base: './',
  // MapLibre spawns its worker via `new Worker(new URL('./maplibre-gl-worker.mjs',
  // import.meta.url))`. Dep pre-bundling rewrites that URL but never emits the
  // worker chunk, so in dev the worker 404s and the map renders blank. Serving
  // MapLibre unbundled keeps the URL resolving against its own dist/ directory.
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    // The bundle is dominated by MapLibre itself, which is needed before
    // anything can render — splitting it out would only add a round-trip.
    chunkSizeWarningLimit: 1500,
  },
});
