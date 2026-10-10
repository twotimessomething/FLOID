import { isDesktop } from './detect';

/**
 * Rating only means something where FLOID came from the App Store. The web has
 * no listing to rate, so the command is disabled there and this never loads
 * the desktop chunk.
 */
export async function openWriteReview(): Promise<void> {
  if (!isDesktop()) return;
  const { openWriteReview: open } = await import('./review.desktop');
  await open();
}
