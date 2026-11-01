// Brand colour helpers. Tailwind reads colours from CSS variables holding "H S% L%" (see index.css),
// so a fleet's #rrggbb brand colour is converted to that form and set on the document root.

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export interface BrandSwatch {
  name: string;
  hex: string;
}

// Every swatch has at least 4.5:1 contrast with white text (checked in brandColor.test.ts).
export const BRAND_SWATCHES: BrandSwatch[] = [
  { name: 'Blue', hex: '#1D4ED8' },
  { name: 'Teal', hex: '#0F766E' },
  { name: 'Green', hex: '#047857' },
  { name: 'Purple', hex: '#6D28D9' },
  { name: 'Red', hex: '#B91C1C' },
  { name: 'Charcoal', hex: '#1F2937' },
];

export function isHexColor(value: string | null | undefined): value is string {
  return !!value && HEX_COLOR.test(value);
}

/** "#1D4ED8" to "224 76% 48%". Returns null when the input is not a #rrggbb colour. */
export function hexToHsl(hex: string | null | undefined): string | null {
  if (!isHexColor(hex)) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function channel(v: number) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG contrast ratio between a #rrggbb colour and white. Returns 0 for invalid input. */
export function contrastWithWhite(hex: string | null | undefined): number {
  if (!isHexColor(hex)) return 0;
  const lum = 0.2126 * channel(parseInt(hex.slice(1, 3), 16))
    + 0.7152 * channel(parseInt(hex.slice(3, 5), 16))
    + 0.0722 * channel(parseInt(hex.slice(5, 7), 16));
  return 1.05 / (lum + 0.05);
}
