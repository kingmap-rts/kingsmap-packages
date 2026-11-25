/** What a new trading post would do to its realm's roads (Game.roadPreview(), KAN-56). */

/** a road the new post would get: `a` is -1 (the new post), `b` the id of the post it runs to */
export interface PreviewRoad {
  a: number;
  b: number;
  /** the route the map would draw, tiles (the same as rules.roadRoute) */
  route: [number, number][];
  /** the hostile seat whose land the road would run through (cut at once), or -1 */
  cut: number;
}

/** the roads a new post would get, and the roads it would take away (ids of their posts) */
export interface RoadPreview {
  add: PreviewRoad[];
  drop: { a: number; b: number }[];
}
