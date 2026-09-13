export type MenuIconName =
  | 'edit'
  | 'collapse'
  | 'expand'
  | 'bar'
  | 'milestone'
  | 'task'
  | 'swatch'
  | 'lock'
  | 'unlock'
  | 'move-out'
  | 'move-up'
  | 'move-down'
  | 'pin'
  | 'unpin'
  | 'export'
  | 'delete';

interface MenuIconProps {
  readonly name: MenuIconName;
  /** Fill for the `swatch` icon only — every other glyph is ink. */
  readonly color?: string;
}

/**
 * The context menu's glyphs.
 *
 * Drawn in the app's own hand rather than pulled from an icon set: a bar is
 * the flat square block it is on the sheet, a milestone the same diamond, a
 * task the circle you tick. The rest are the plainest shape that says the
 * verb — an arrow, a padlock, a tack. Everything is `currentColor`, so the
 * delete row's danger ink reaches the trash can without a second rule, and
 * everything is stroked at one weight so no glyph prints heavier than its
 * neighbours.
 */
export function MenuIcon({ name, color }: MenuIconProps): JSX.Element {
  return (
    <svg
      className="w-3.5 h-3.5 flex-shrink-0 opacity-70"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {renderGlyph(name, color)}
    </svg>
  );
}

function renderGlyph(name: MenuIconName, color?: string): JSX.Element {
  switch (name) {
    case 'edit':
      return (
        <>
          <path d="M11.2 2.9l1.9 1.9-7.2 7.2-2.5.6.6-2.5z" />
          <path d="M9.8 4.3l1.9 1.9" />
        </>
      );

    case 'collapse':
      return <path d="M4 10l4-4 4 4" />;

    case 'expand':
      return <path d="M4 6l4 4 4-4" />;

    // The sheet's own marks: a square block, a diamond, a ticked circle.
    case 'bar':
      return <rect x="2" y="5.5" width="12" height="5" fill="currentColor" stroke="none" />;

    case 'milestone':
      return <path d="M8 3.5L12.5 8 8 12.5 3.5 8z" fill="currentColor" stroke="none" />;

    case 'task':
      return (
        <>
          <circle cx="8" cy="8" r="5.5" />
          <path d="M5.6 8.1l1.7 1.7 3.2-3.6" />
        </>
      );

    case 'swatch':
      return <circle cx="8" cy="8" r="5" fill={color} stroke="var(--color-hairline)" />;

    case 'lock':
      return (
        <>
          <rect x="3.5" y="7" width="9" height="6.3" rx="1" />
          <path d="M5.75 7V5a2.25 2.25 0 014.5 0v2" />
        </>
      );

    // An open padlock is the closed one with the shackle sprung off its body.
    case 'unlock':
      return (
        <>
          <rect x="3.5" y="7" width="9" height="6.3" rx="1" />
          <path d="M9 7V4.75a2.25 2.25 0 014.5 0V6" />
        </>
      );

    case 'move-out':
      return (
        <>
          <path d="M12.5 13V7.5a2 2 0 00-2-2H4" />
          <path d="M6.5 3L4 5.5 6.5 8" />
        </>
      );

    case 'move-up':
      return (
        <>
          <path d="M8 13V3.4" />
          <path d="M4.5 6.9L8 3.4l3.5 3.5" />
        </>
      );

    case 'move-down':
      return (
        <>
          <path d="M8 3v9.6" />
          <path d="M4.5 9.1L8 12.6l3.5-3.5" />
        </>
      );

    case 'pin':
      return (
        <>
          <path d="M5 2.5h6" />
          <path d="M6.5 2.5v5L5 9.8h6L9.5 7.5v-5" />
          <path d="M8 9.8v3.7" />
        </>
      );

    case 'unpin':
      return (
        <>
          <path d="M5 2.5h6" />
          <path d="M6.5 2.5v5L5 9.8h6L9.5 7.5v-5" />
          <path d="M8 9.8v3.7" />
          <path d="M3 13L13 3" />
        </>
      );

    case 'export':
      return (
        <>
          <path d="M8 2.6v7.6" />
          <path d="M5 7.2l3 3 3-3" />
          <path d="M3.2 12.9h9.6" />
        </>
      );

    case 'delete':
      return (
        <>
          <path d="M3 4.5h10" />
          <path d="M6.5 4.5V3.2h3v1.3" />
          <path d="M4.6 4.5L5.2 13h5.6l.6-8.5" />
        </>
      );
  }
}
