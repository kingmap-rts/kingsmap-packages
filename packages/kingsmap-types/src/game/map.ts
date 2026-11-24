/** What a tile is made of; soldiers walk and posts stand on plains and forests. */
export enum Terrain {
  Water = 0,
  Plain = 1,
  Forest = 2,
  Mountain = 3,
}

/** What lies in a tile and feeds the post whose land covers it. */
export enum Deposit {
  None = 0,
  Ore = 1,
  Grain = 2,
  Crystal = 3,
}
