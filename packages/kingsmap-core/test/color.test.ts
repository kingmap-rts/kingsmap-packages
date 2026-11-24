import { Color } from '@kingmap-rts/kingsmap-types';
import { describe, expect, it } from 'vitest';
import { toCss, toPixi, toRgbChannels } from '../src/color';

describe('palette', () => {
  it('holds only #rrggbb values', () => {
    for (const [name, value] of Object.entries(Color))
      expect(value, name).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('converts for PixiJS and CSS', () => {
    expect(toPixi(Color.White)).toBe(0xffffff);
    expect(toPixi(Color.Shadow)).toBe(0x140a00);
    expect(toCss(Color.Ink)).toBe('#2b1d10');
    expect(toCss(Color.Shadow, 0.4)).toBe('rgba(20, 10, 0, 0.4)');
    expect(toRgbChannels(Color.Paper)).toBe('239 220 178');
  });
});
