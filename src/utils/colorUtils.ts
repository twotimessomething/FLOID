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

const INK = '#17171A';
const PAPER = '#FFFFFF';

/**
 * Luminance at which ink and paper give equal contrast against a backdrop.
 *
 * Solving `(L + 0.05) / (Link + 0.05) = 1.05 / (L + 0.05)` for the ink above
 * puts the crossover at 0.198 — above it, ink wins; below it, paper does.
 * Picking this by eye lands far too high and silently hands mid-tones like
 * teal white text at ~2.4:1 when ink would have given ~7.4:1.
 */
const INK_CROSSOVER_LUMINANCE = 0.198;

/**
 * Saturated reds and oranges are the deliberate exception.
 *
 * Measured contrast still favours ink there — black on the palette's orange is
 * 5.98:1 against white's 2.99:1 — but the numbers do not describe how the bars
 * read: on a hot mid-tone the dark label sinks into the fill, while paper stays
 * crisp. Those bars are given paper up to a much higher crossover, at the cost
 * of failing AA for small text on the lightest of them.
 *
 * The window is kept tight on purpose — hue 350°–40° at 50%+ saturation, below
 * 0.35 luminance. That covers the palette's red and orange and every step of
 * their gradients, so a schedule never switches label colour halfway down its
 * own ramp, and it leaves ochre (43°) and every cool hue on the measured rule.
 */
const WARM_HUE_MIN = 350;
const WARM_HUE_MAX = 40;
const WARM_SATURATION_MIN = 50;
const WARM_INK_CROSSOVER_LUMINANCE = 0.35;

/**
 * Pick ink or paper for text sitting on a colored bar, whichever contrasts
 * more. Ties go to ink: white text on color reads heavier than this design
 * wants, and the palette's cool mid-tones all sit on the ink side of the line.
 * Saturated warm bars are the exception — see the crossover constants above.
 */
export function getReadableTextColor(hex: string): string {
  const cleanHex = hex.replace(/^#/, '').slice(0, 6);
  if (cleanHex.length < 6) return INK;

  const toLinear = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };

  const r = toLinear(parseInt(cleanHex.slice(0, 2), 16));
  const g = toLinear(parseInt(cleanHex.slice(2, 4), 16));
  const b = toLinear(parseInt(cleanHex.slice(4, 6), 16));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  const { h, s } = hexToHsl(cleanHex);
  const isWarm = (h >= WARM_HUE_MIN || h <= WARM_HUE_MAX) && s >= WARM_SATURATION_MIN;
  const crossover = isWarm ? WARM_INK_CROSSOVER_LUMINANCE : INK_CROSSOVER_LUMINANCE;

  return luminance >= crossover ? INK : PAPER;
}
