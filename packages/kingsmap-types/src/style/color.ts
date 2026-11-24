/**
 * The colour palette of King's Map: every colour of the front end (CSS and the PixiJS map) and of
 * the packages, named by what it is for. The one place a colour is written down.
 *
 * - Values are CSS hex strings `'#rrggbb'`, so a member works as is in CSS-in-TS, canvas 2D and SVG.
 * - PixiJS wants a number: `toPixi(Color.Ink)` from @kingmap-rts/kingsmap-core; with alpha in CSS
 *   strings: `toCss(Color.Shadow, 0.4)`.
 * - CSS modules read the same values as custom properties: `var(--color-paper-light)` and, for
 *   alpha, `rgb(var(--color-shadow-rgb) / 0.4)` (the front end generates them from this enum).
 * - A new colour goes here first; reuse a member before adding a near-identical one.
 */
export enum Color {
  // Neutrals
  /** pure white: text on dark buttons, "no tint" for sprites, selection rings */
  White = '#ffffff',
  /** pure black: shadows, outlines */
  Black = '#000000',
  /** warm near-black for drop shadows, dimming backdrops and sunk slots (always with alpha) */
  Shadow = '#140a00',

  // Parchment and ink (UI)
  /** parchment: the base of menus and panels */
  Paper = '#efdcb2',
  /** light parchment: panel fills, light text on wood */
  PaperLight = '#f6e8c6',
  /** dark parchment: gradient edge, muted text on wood */
  PaperDark = '#dcc28c',
  /** second parchment tone: list rows, cards */
  PaperMid = '#e6d0a2',
  /** pale parchment: cards and tiles on parchment, smoke and dust */
  PaperPale = '#f8eed8',
  /** info card background */
  PaperCard = '#fbf1d8',
  /** rules and borders on parchment */
  PaperRule = '#b9975e',
  /** thin separators inside parchment lists */
  PaperLine = '#d8c9a6',
  /** light text on red/blue/dark buttons and banners */
  Cream = '#fff8e6',
  /** ink: main text, dark outlines on the map */
  Ink = '#2b1d10',
  /** secondary text; warm glow on the desk */
  InkSoft = '#5e4426',
  /** placeholder text in inputs */
  InkFaded = '#7a6440',
  /** map label text (realm names) */
  LabelInk = '#222222',

  // Wood (frames, bars)
  /** dark wood: bars and frames */
  Wood = '#3a2616',
  /** wood between light and dark: active rows, unit mark outlines */
  WoodMid = '#4a3220',
  /** light wood: top of wood gradients */
  WoodLight = '#5a3b22',
  /** text on wood */
  WoodText = '#f3e2bc',
  /** muted text on wood */
  WoodMuted = '#cdb184',
  /** the desk under the page, the map background */
  Desk = '#21150b',
  /** tan borders and dividers on parchment */
  Tan = '#b48a52',
  /** sandbox toolbar button border */
  SandboxBorder = '#6b5536',
  /** sandbox toolbar active button */
  SandboxActive = '#8a6a33',
  /** sandbox toolbar active button border */
  SandboxActiveBorder = '#c9a35a',

  // Reds
  /** the red of the UI: warnings, enemies, primary actions; also map red (no supply, bad build tile) */
  Red = '#a3271c',
  /** dark red: gradient bottoms, red text on pale red */
  RedDark = '#6e170f',
  /** text shadow under red buttons */
  RedShadow = '#500f0f',
  /** text and drop shadow on the pack red button */
  RedButtonShadow = '#8a2a2a',
  /** dark red button gradient top */
  RedDeepTop = '#5a120c',
  /** dark red button gradient bottom */
  RedDeepBottom = '#3a0a06',
  /** dark red button border and shadow */
  RedDeepEdge = '#2a0603',
  /** wax seal red */
  Seal = '#8f211b',
  /** wax seal highlight */
  SealLight = '#c9473f',
  /** wax seal rim; the order bar attack icon */
  SealRim = '#b13a32',
  /** pale red background (danger notes) */
  RedPale = '#f6d2c4',
  /** abilities card background */
  RedPaleWarm = '#f6dfc4',
  /** notification badge */
  Badge = '#e04a3a',
  /** negative numbers on the top bar */
  DeltaBad = '#ff9584',
  /** chat signal: help */
  SignalHelp = '#c0571b',
  /** chat signal: thanks */
  SignalThanks = '#b2304f',

  // Golds
  /** gold trim of the UI */
  Gold = '#b8862b',
  /** gold on the map: tutorial mark, half health, spell radius */
  MapGold = '#d4a62a',
  /** gold glow around hovered/highlighted controls */
  Glow = '#f2c64a',
  /** pale gold: highlighted texts and cards */
  GoldPale = '#f1d39a',
  /** tooltip title */
  TipTitle = '#ffe6a8',
  /** ochre: chat signal "hi", the order bar trade icon */
  Ochre = '#a8720f',

  // Greens
  /** UI green: peace, allowed */
  Green = '#2f6b2a',
  /** ally text and allied banners */
  Ally = '#3f6f35',
  /** green button top; the order bar build icon */
  GreenMid = '#3d7a33',
  /** green button bottom, meadow shade */
  GreenDark = '#2a5523',
  /** green button border, dark text shadow on grass */
  GreenDeep = '#1d3d18',
  /** pale green: allied cards */
  GreenPale = '#dfe9c8',
  /** green on the map: health, good build tile */
  MapGreen = '#4c8a3c',
  /** start page meadow */
  Meadow = '#6fa83b',
  /** sunlight on the meadow and lit grass */
  MeadowLight = '#f0e678',
  /** grass on the minimap */
  MinimapGrass = '#9bb84f',
  /** order accepted marker, online dot */
  Ok = '#7ee787',
  /** positive numbers on the top bar */
  DeltaGood = '#a6e58f',

  // Blues
  /** navy text shadow on menu buttons and banners */
  Navy = '#1f2b3c',
  /** dark blue: blue button shadow, paths header */
  BlueDark = '#1f3a52',
  /** blue: selected path, the order bar move icon */
  Blue = '#2a78b4',
  /** shadow under a selected blue card */
  BlueShadow = '#1f5a8a',
  /** light blue glow: active orders, roads under the mouse, crystal shine */
  Sky = '#72ccff',
  /** pale blue text on dark */
  Ice = '#dff3ff',
  /** ammo bar */
  Ammo = '#7f9ab8',
  /** water */
  Water = '#47aba9',
  /** the art pack's shadow colour */
  PackShadow = '#161c2e',

  // Greys
  /** neutral (unowned) team colour */
  Nobody = '#9a9a9a',
  /** tint of units without supply */
  Unsupplied = '#b8b8b8',
  /** grey stones and rubble */
  Stone = '#555555',
  /** offline dot */
  Offline = '#6e7681',
  /** unowned capture site */
  SiteFree = '#8a7a5e',
  /** burnt road tint */
  Burnt = '#6a5a4a',

  // Fire and effects
  /** fire, burning roads */
  Fire = '#e8632a',
  /** fire core */
  FireLight = '#ffd23a',
  /** fire aura */
  FireGlow = '#ff6a2a',
  /** fire aura edge */
  FireEdge = '#c43c1a',
  /** trap marks, tutorial highlight pulse */
  Trap = '#ff8a2a',
  /** tint of a hit unit */
  Hurt = '#ff4a3a',
  /** lost loot text, attack marker */
  Hit = '#ff7b72',
  /** attack-move marker */
  AttackMove = '#ffa657',
  /** explosions, burning, sabotage */
  Blast = '#ff7b3d',
  /** sparks of a hit */
  Spark = '#ffb27a',

  // Realms (seat order of the core)
  PlayerBlue = '#1f6fe0',
  PlayerRed = '#e0302a',
  PlayerYellow = '#f2c230',
  PlayerPurple = '#8e44d6',
  PlayerOrange = '#f07a1a',
  PlayerCyan = '#12b5c8',
  PlayerPink = '#e8489a',
  PlayerWhite = '#f4f1e8',
  PlayerBlack = '#2b2f3a',
  PlayerBrown = '#8b5a2b',
  /** label colour of the white realm (white on the map would vanish) */
  PlayerWhiteLabel = '#6e6a60',

  // Resources
  /** wood icons and texts */
  ResourceWood = '#b5793f',
  /** ore icons and texts */
  ResourceOre = '#7d8894',
  /** steel icons and texts */
  ResourceSteel = '#e6eef5',
  /** food icons and texts */
  ResourceFood = '#f0cf4a',
  /** crystal icons and texts */
  ResourceCrystal = '#3fb6ff',
  /** wood on caravans and stock bars */
  CargoWood = Color.PlayerBrown,
  /** ore on caravans and stock bars */
  CargoOre = '#6b6b66',
  /** steel on caravans and stock bars */
  CargoSteel = '#3a3f45',
  /** food on caravans and stock bars */
  CargoFood = '#d8b03a',
  /** crystal on caravans and stock bars */
  CargoCrystal = '#3fa8ef',

  // Debug map (kingsmap-tools cmap)
  DebugGrass = '#7a9a5a',
  DebugWater = '#3a6ea5',
  DebugMountain = '#888888',
  DebugForest = '#3d6b35',
  DebugCrystal = '#3fd0ff',

  // Brands (sign-in buttons; exact brand colours, never change)
  GoogleText = '#1f1f1f',
  GoogleBorder = '#747775',
  GoogleRed = '#ea4335',
  GoogleBlue = '#4285f4',
  GoogleYellow = '#fbbc05',
  GoogleGreen = '#34a853',
  Discord = '#5865f2',
  DiscordBorder = '#4752c4',
}
