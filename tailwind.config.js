/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      /**
       * The type scale.
       *
       * Sizes are in rem so the browser's own text-size setting moves them —
       * a fixed pixel is a decision taken away from the reader. Leading and
       * tracking are part of each step rather than set once globally: letters
       * read further apart as they grow, so large text is tightened and small
       * text is opened up, and lines want more air the shorter the type gets.
       */
      fontSize: {
        // 10px — uppercase eyebrows and axis furniture
        micro: ['0.625rem', { lineHeight: '1', letterSpacing: '0.06em' }],
        // 11px — secondary metadata, dates, milestone labels
        meta: ['0.6875rem', { lineHeight: '1.35', letterSpacing: '0.005em' }],
        // 12px — text sitting on a bar, where the colour already carries it
        bar: ['0.75rem', { lineHeight: '1', letterSpacing: '0' }],
        // 13px — the app's body size
        body: ['0.8125rem', { lineHeight: '1.45', letterSpacing: '0' }],
        // 15px — panel and dialog headings
        title: ['0.9375rem', { lineHeight: '1.3', letterSpacing: '-0.006em' }],
        // 22px — the one display size, used where a screen has a subject
        display: ['1.375rem', { lineHeight: '1.15', letterSpacing: '-0.018em' }],
      },
      /**
       * Elevation. These override Tailwind's own sm/md/lg so the only shadows
       * reachable from a class are the three the design system defines.
       *
       * They must live here rather than as `shadow-[var(--shadow-lg)]`: given a
       * bare `var()` Tailwind cannot see a length, assumes a colour, and emits
       * `--tw-shadow-color` — which sets no box-shadow at all. Every floating
       * surface in the app was flat for exactly that reason.
       */
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      /**
       * Three durations, named for what is moving rather than for a number.
       * They resolve to the same custom properties the stylesheet uses, so a
       * change lands in both at once.
       */
      transitionDuration: {
        fast: 'var(--duration-fast)',
        base: 'var(--duration-base)',
        slow: 'var(--duration-slow)',
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
        drawer: 'var(--ease-drawer)',
      },
    },
  },
  plugins: [],
};
