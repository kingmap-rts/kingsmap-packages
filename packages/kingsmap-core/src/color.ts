/**
 * The palette in the formats renderers need. The colours themselves are the `Color` enum of
 * @kingmap-rts/kingsmap-types (`'#rrggbb'` strings); never write a colour literal elsewhere.
 */
import type { Color } from '@kingmap-rts/kingsmap-types';

/** a palette colour as the number PixiJS takes (`0xrrggbb`) */
export function toPixi(color: Color): number {
  return parseInt(color.slice(1), 16);
}

/** a palette colour for CSS / canvas 2D: `'#rrggbb'`, or `'rgba(r, g, b, alpha)'` with an alpha */
export function toCss(color: Color, alpha?: number): string {
  if (alpha === undefined) return color;
  const n = toPixi(color);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** a palette colour as `'r g b'`, the channel list CSS `rgb(r g b / alpha)` takes */
export function toRgbChannels(color: Color): string {
  const n = toPixi(color);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}
