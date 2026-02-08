// Color utility functions for dynamic phase coloring

interface HSL {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

/**
 * Convert hex color to HSL
 */
export function hexToHsl(hex: string): HSL {
  // Remove # if present
  const cleanHex = hex.replace(/^#/, '');

  // Parse RGB values
  const r = parseInt(cleanHex.slice(0, 2), 16) / 255;
  const g = parseInt(cleanHex.slice(2, 4), 16) / 255;
  const b = parseInt(cleanHex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    // Achromatic
    return { h: 0, s: 0, l: l * 100 };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    case b:
      h = ((r - g) / d + 4) / 6;
      break;
  }

  return {
    h: h * 360,
    s: s * 100,
    l: l * 100,
  };
}

/**
 * Convert HSL to hex color
 */
export function hslToHex(h: number, s: number, l: number): string {
  // Normalize values
  const hNorm = ((h % 360) + 360) % 360; // Handle negative hue
  const sNorm = Math.max(0, Math.min(100, s)) / 100;
  const lNorm = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let r = 0,
    g = 0,
    b = 0;

  if (hNorm < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (hNorm < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (hNorm < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (hNorm < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (hNorm < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  const toHex = (value: number): string => {
    const hex = Math.round((value + m) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

import { HUE_SHIFT, LIGHTNESS_SHIFT } from '../constants/colors';

/**
 * Get phase color based on position within the phase list.
 * Creates a subtle gradient from base color to a shifted variant.
 *
 * @param baseColor - The section's base color (hex)
 * @param phaseIndex - The index of this phase (0-based, by order)
 * @param totalPhases - Total number of phases in the section
 * @returns Interpolated hex color
 */
export function getPhaseColorInRange(
  baseColor: string,
  phaseIndex: number,
  totalPhases: number
): string {
  // Single phase or invalid input - return base color
  if (totalPhases <= 1 || phaseIndex < 0) {
    return baseColor;
  }

  const baseHsl = hexToHsl(baseColor);

  // Calculate interpolation factor (0 = first phase, 1 = last phase)
  const t = phaseIndex / (totalPhases - 1);

  // Interpolate HSL values
  const h = baseHsl.h + HUE_SHIFT * t;
  const s = baseHsl.s; // Keep saturation constant
  const l = baseHsl.l + LIGHTNESS_SHIFT * t;

  return hslToHex(h, s, l);
}
