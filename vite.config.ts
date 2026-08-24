import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * What goes in which file the browser downloads.
 *
 * Vendor code is split off because it changes on a different clock to the app.
 * The template library is split off for the same reason and one more: it is
 * roughly three thousand lines of static data that only a project or schedule
 * being created ever reads, and keeping it out of the main chunk means editing
 * the app does not re-download the templates, or the other way round.
 *
 * It is still reached through a plain import in `projectStore`, so it is part
 * of the initial graph rather than an async chunk — separating it is a caching
 * and parsing win, not yet a deferral one. Deferring it outright would mean
 * making the store's template lookups async.
 *
 * The PowerPoint writer is the one true deferral: it is larger than the whole
 * app, and only reached by `import()` from the slide export, so it never loads
 * for someone who does not export one. It is named here so the build output
 * says which chunk that is.
 */
function manualChunks(id: string): string | undefined {
  if (id.includes('/node_modules/date-fns/')) return 'date-fns';
  if (id.includes('/node_modules/pptxgenjs/')) return 'pptxgenjs';
  if (id.includes('/node_modules/zustand/') || id.includes('/node_modules/zundo/')) {
    return 'zustand';
  }
  if (id.includes('/src/data/templates/')) return 'templates';
  return undefined;
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  optimizeDeps: {
    // pptxgenjs is only ever reached by `import()`, which in dev means Vite
    // discovers it mid-export and reloads the page to re-optimize — right as
    // someone is waiting for a file. Pre-bundling it costs one dev startup.
    include: ['react', 'react-dom', 'zustand', 'date-fns', 'pptxgenjs'],
  },
});
