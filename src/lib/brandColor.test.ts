import { describe, it, expect } from 'vitest';
import { BRAND_SWATCHES, contrastWithWhite, hexToHsl, isHexColor } from './brandColor';

describe('hexToHsl', () => {
  it('converts primary colours', () => {
    expect(hexToHsl('#ff0000')).toBe('0 100% 50%');
    expect(hexToHsl('#00ff00')).toBe('120 100% 50%');
    expect(hexToHsl('#0000FF')).toBe('240 100% 50%');
  });

  it('converts greys and extremes with no saturation', () => {
    expect(hexToHsl('#000000')).toBe('0 0% 0%');
    expect(hexToHsl('#ffffff')).toBe('0 0% 100%');
    expect(hexToHsl('#808080')).toBe('0 0% 50%');
  });

  it('converts a brand colour', () => {
    expect(hexToHsl('#1D4ED8')).toBe('224 76% 48%');
  });

  it('returns null for anything that is not #rrggbb', () => {
    expect(hexToHsl(null)).toBeNull();
    expect(hexToHsl('')).toBeNull();
    expect(hexToHsl('blue')).toBeNull();
    expect(hexToHsl('#fff')).toBeNull();
    expect(hexToHsl('#gggggg')).toBeNull();
    expect(isHexColor('1D4ED8')).toBe(false);
  });
});

describe('brand swatches', () => {
  it('has six swatches that read with white text', () => {
    expect(BRAND_SWATCHES).toHaveLength(6);
    for (const s of BRAND_SWATCHES) {
      expect(contrastWithWhite(s.hex)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('measures contrast against white', () => {
    expect(contrastWithWhite('#000000')).toBeCloseTo(21, 0);
    expect(contrastWithWhite('#ffffff')).toBeCloseTo(1, 1);
    expect(contrastWithWhite('nope')).toBe(0);
  });
});
