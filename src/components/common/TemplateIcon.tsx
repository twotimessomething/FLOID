import type { ScheduleTemplate } from '../../data/templates/types';

/**
 * The glyph that stands beside a template's name.
 *
 * It is drawn as plain ink: no fill, no chip, no colour of its own. Size and
 * colour come from the row it sits in via `className` and `currentColor`, so a
 * picker can weight the glyph with its label instead of parking it in a tinted
 * container.
 */
interface TemplateIconProps {
  readonly icon: ScheduleTemplate['icon'];
  /** Sizing and colour classes. The strokes follow `currentColor`. */
  readonly className?: string;
}

const DEFAULT_ICON_CLASS = 'w-4 h-4';

/**
 * The stroke data for each glyph. Only the cog needs a second path, so the
 * lookup returns a list and the component draws whatever it gets back.
 */
function pathsForIcon(icon: ScheduleTemplate['icon']): readonly string[] {
  switch (icon) {
    case 'palette':
      return [
        'M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z',
      ];
    case 'cog':
      return [
        'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
        'M15 12a3 3 0 11-6 0 3 3 0 016 0z',
      ];
    case 'megaphone':
      return [
        'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z',
      ];
    case 'code':
      return ['M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4'];
    case 'clipboard':
      return [
        'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
      ];
    case 'plus':
      return ['M12 4v16m8-8H4'];
    default:
      // A calendar for an icon name the type does not yet know about, so a
      // future template still draws something rather than nothing.
      return ['M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'];
  }
}

export function TemplateIcon({
  icon,
  className = DEFAULT_ICON_CLASS,
}: TemplateIconProps): JSX.Element {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {pathsForIcon(icon).map((d) => (
        <path key={d} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={d} />
      ))}
    </svg>
  );
}
