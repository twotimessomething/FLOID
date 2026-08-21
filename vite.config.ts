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
 */
function manualChunks(id: string): string | undefined {
  if (id.includes('/node_modules/date-fns/')) return 'date-fns';
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
    include: ['react', 'react-dom', 'zustand', 'date-fns'],
  },
});
