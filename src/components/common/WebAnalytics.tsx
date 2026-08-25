import { Analytics } from '@vercel/analytics/react';
import { isDesktop } from '../../platform/detect';

/**
 * Vercel Analytics is a web concern. The desktop app is fully offline —
 * `<Analytics />` injects its script on mount, so gating the mount is the
 * whole job.
 */
export function WebAnalytics(): JSX.Element | null {
  if (isDesktop()) return null;
  return <Analytics />;
}
