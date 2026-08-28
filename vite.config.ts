import { defineConfig } from 'vite';

// Relative base so the production build also works when served from a subpath
// or opened via a static file host.
export default defineConfig({
  base: './',
  // MapLibre resolves its worker against its own `import.meta.url`. Dep
  // pre-bundling rewrites that URL but never emits the worker chunk, so in dev
  // the worker 404s and the map renders blank. Serving MapLibre unbundled keeps
  // the URL resolving against its own dist/ directory. (The production build
  // has the same problem for a different reason — see `setWorkerUrl` in
  // src/main.ts, which is what actually fixes it there.)
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  // MapLibre loads its worker with `{ type: 'module' }`, so emit a real ES
  // module worker rather than Vite's default IIFE.
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    // The bundle is dominated by MapLibre itself, which is needed before
    // anything can render — splitting it out would only add a round-trip.
    chunkSizeWarningLimit: 1500,
  },
});
