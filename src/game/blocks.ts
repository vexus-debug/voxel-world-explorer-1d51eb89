// Hot numeric voxel loops: index-signature strictness is disabled here for readability.
// @ts-nocheck
export const B = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  LOG: 4,
  LEAVES: 5,
  SAND: 6,
  PLANKS: 7,
  COBBLE: 8,
  BRICK: 9,
  GLASS: 10,
  BEDROCK: 11,
} as const;

export type Tool = "pickaxe" | "axe" | "shovel";

export interface BlockDef {
  name: string;
  hardness: number; // seconds by hand
  tool: Tool | null;
  tiles: [number, number, number]; // top, side, bottom
  drop: number;
  transparent?: boolean;
}

export const BLOCKS: Record<number, BlockDef> = {
  [B.GRASS]: { name: "Grass", hardness: 0.9, tool: "shovel", tiles: [0, 1, 2], drop: B.DIRT },
  [B.DIRT]: { name: "Dirt", hardness: 0.75, tool: "shovel", tiles: [2, 2, 2], drop: B.DIRT },
  [B.STONE]: { name: "Stone", hardness: 4, tool: "pickaxe", tiles: [3, 3, 3], drop: B.COBBLE },
  [B.LOG]: { name: "Log", hardness: 2.5, tool: "axe", tiles: [5, 4, 5], drop: B.LOG },
  [B.LEAVES]: { name: "Leaves", hardness: 0.3, tool: null, tiles: [6, 6, 6], drop: 0, transparent: true },
  [B.SAND]: { name: "Sand", hardness: 0.75, tool: "shovel", tiles: [7, 7, 7], drop: B.SAND },
  [B.PLANKS]: { name: "Planks", hardness: 2, tool: "axe", tiles: [8, 8, 8], drop: B.PLANKS },
  [B.COBBLE]: { name: "Cobblestone", hardness: 4.5, tool: "pickaxe", tiles: [9, 9, 9], drop: B.COBBLE },
  [B.BRICK]: { name: "Bricks", hardness: 5, tool: "pickaxe", tiles: [10, 10, 10], drop: B.BRICK },
  [B.GLASS]: { name: "Glass", hardness: 0.4, tool: null, tiles: [11, 11, 11], drop: 0, transparent: true },
  [B.BEDROCK]: { name: "Bedrock", hardness: Infinity, tool: null, tiles: [12, 12, 12], drop: 0 },
};

export type Item =
  | { kind: "tool"; tool: Tool; name: string; tile: number; damage: number }
  | { kind: "block"; block: number; name: string; tile: number };

export const HOTBAR: Item[] = [
  { kind: "tool", tool: "pickaxe", name: "Pickaxe", tile: 13, damage: 4 },
  { kind: "tool", tool: "axe", name: "Axe", tile: 14, damage: 5 },
  { kind: "tool", tool: "shovel", name: "Shovel", tile: 15, damage: 3 },
  { kind: "block", block: B.DIRT, name: "Dirt", tile: 2 },
  { kind: "block", block: B.COBBLE, name: "Cobblestone", tile: 9 },
  { kind: "block", block: B.LOG, name: "Log", tile: 4 },
  { kind: "block", block: B.PLANKS, name: "Planks", tile: 8 },
  { kind: "block", block: B.SAND, name: "Sand", tile: 7 },
  { kind: "block", block: B.BRICK, name: "Bricks", tile: 10 },
];

export const isTransparent = (id: number) => id === 0 || !!BLOCKS[id]?.transparent;

// ---------- Procedural texture atlas (4x4 tiles, 16px each) ----------
export const ATLAS_COLS = 4;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5) >>> 0;
    return (s >>> 8) / 16777216;
  };
}

export function drawAtlas(): HTMLCanvasElement {
  const T = 16;
  const c = document.createElement("canvas");
  c.width = c.height = T * ATLAS_COLS;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(c.width, c.height);
  const r = rng(1337);
  const put = (tile: number, f: (x: number, y: number, n: number) => number[] | null) => {
    const ox = (tile % ATLAS_COLS) * T;
    const oy = Math.floor(tile / ATLAS_COLS) * T;
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const col = f(x, y, r());
        if (!col) continue;
        const i = ((oy + y) * c.width + ox + x) * 4;
        img.data[i] = col[0];
        img.data[i + 1] = col[1];
        img.data[i + 2] = col[2];
        img.data[i + 3] = col[3] ?? 255;
      }
  };
  const shade = (base: number[], n: number, amt: number) => base.map((v) => Math.max(0, Math.min(255, v + (n - 0.5) * amt)));
  const grass = [96, 152, 58], dirt = [134, 96, 67], stone = [128, 128, 128];

  put(0, (_x, _y, n) => shade(grass, n, 50));
  const edge = Array.from({ length: 16 }, () => 3 + Math.floor(r() * 3));
  put(1, (x, y, n) => (y < edge[x] ? shade(grass, n, 50) : shade(dirt, n, 40)));
  put(2, (_x, _y, n) => shade(dirt, n, 40));
  put(3, (_x, _y, n) => shade(stone, n, 45));
  put(4, (x, _y, n) => shade(x % 4 === 0 ? [80, 58, 34] : [107, 81, 50], n, 25));
  put(5, (x, y, n) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6.5) return shade([107, 81, 50], n, 20);
    return shade(Math.floor(d) % 2 ? [176, 140, 90] : [150, 116, 72], n, 20);
  });
  put(6, (_x, _y, n) => (n < 0.14 ? [0, 0, 0, 0] : shade([58, 120, 40], n, 60)));
  put(7, (_x, _y, n) => shade([219, 207, 160], n, 25));
  put(8, (x, y, n) => {
    if (y % 4 === 3) return [110, 82, 48];
    if (x === ((y >> 2) % 2 ? 4 : 11)) return [125, 95, 56];
    return shade([168, 134, 82], n, 22);
  });
  put(9, (x, y, n) => {
    const cell = (Math.floor(x / 5) + Math.floor((y + (Math.floor(x / 5) % 2) * 2) / 5)) % 3;
    if (x % 5 === 0 || (y + (Math.floor(x / 5) % 2) * 2) % 5 === 0) return shade([80, 80, 80], n, 20);
    return shade(cell === 0 ? [140, 140, 140] : cell === 1 ? [118, 118, 118] : [128, 128, 128], n, 30);
  });
  put(10, (x, y, n) => {
    const off = Math.floor(y / 4) % 2 ? 4 : 0;
    if (y % 4 === 3 || (x + off) % 8 === 7) return shade([190, 185, 175], n, 20);
    return shade([150, 70, 55], n, 30);
  });
  put(11, (x, y) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return [210, 235, 240, 255];
    if ((x === 3 && y > 2 && y < 7) || (x === 4 && y > 3 && y < 6)) return [240, 250, 255, 255];
    return [0, 0, 0, 0];
  });
  put(12, (_x, _y, n) => shade(n > 0.7 ? [30, 30, 30] : [70, 70, 70], n, 30));
  // tools: diagonal handle + head
  const handle = (x: number, y: number) => x + y === 15 && x >= 2 && x <= 11;
  put(13, (x, y) => {
    if (y <= 4 && Math.abs(x - y - 8) <= 0 && false) return null;
    if ((y === 2 && x >= 6 && x <= 14) || (x === 13 && y >= 2 && y <= 9) || (y === 3 && x >= 8 && x <= 13) || (x === 12 && y >= 3 && y <= 7))
      return [170, 180, 190, 255];
    if (handle(x, y)) return [120, 85, 45, 255];
    return [0, 0, 0, 0];
  });
  put(14, (x, y) => {
    if (x >= 8 && x <= 13 && y >= 1 && y <= 6 && x + y >= 11) return [170, 180, 190, 255];
    if (handle(x, y)) return [120, 85, 45, 255];
    return [0, 0, 0, 0];
  });
  put(15, (x, y) => {
    if (x >= 10 && x <= 14 && y >= 1 && y <= 5 && Math.abs(x - 12) + Math.abs(y - 3) <= 3) return [170, 180, 190, 255];
    if (handle(x, y)) return [120, 85, 45, 255];
    return [0, 0, 0, 0];
  });
  ctx.putImageData(img, 0, 0);
  return c;
}
