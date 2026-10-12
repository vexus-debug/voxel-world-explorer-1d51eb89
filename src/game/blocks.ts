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

// Tileable value noise (period p) for realistic surface detail.
function makeNoise(seed: number) {
  const r = rng(seed);
  const g = new Float32Array(256 * 256).map(() => r());
  const at = (x: number, y: number, p: number) => g[((((y % p) + p) % p) << 8) | (((x % p) + p) % p)];
  const sm = (t: number) => t * t * (3 - 2 * t);
  const n = (x: number, y: number, p: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
    const a = at(xi, yi, p), b = at(xi + 1, yi, p), c = at(xi, yi + 1, p), d = at(xi + 1, yi + 1, p);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  // fbm over u,v in [0,1)
  return (u: number, v: number, base = 4, oct = 4) => {
    let s = 0, amp = 0.5, tot = 0, f = base;
    for (let o = 0; o < oct; o++) { s += n(u * f, v * f, f) * amp; tot += amp; amp *= 0.5; f *= 2; }
    return s / tot;
  };
}

export function drawAtlas(): HTMLCanvasElement {
  const T = 64;
  const c = document.createElement("canvas");
  c.width = c.height = T * ATLAS_COLS;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(c.width, c.height);
  const r = rng(1337);
  const N = makeNoise(7), M = makeNoise(99);
  // f receives u,v in [0,1), per-pixel random n
  const put = (tile: number, f: (u: number, v: number, n: number) => number[] | null) => {
    const ox = (tile % ATLAS_COLS) * T, oy = Math.floor(tile / ATLAS_COLS) * T;
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const col = f(x / T, y / T, r());
        if (!col) continue;
        const i = ((oy + y) * c.width + ox + x) * 4;
        img.data[i] = Math.max(0, Math.min(255, col[0]));
        img.data[i + 1] = Math.max(0, Math.min(255, col[1]));
        img.data[i + 2] = Math.max(0, Math.min(255, col[2]));
        img.data[i + 3] = col[3] ?? 255;
      }
  };
  const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * Math.max(0, Math.min(1, t)));
  const mul = (a: number[], k: number) => a.map((v) => v * k);

  const grassCol = (u: number, v: number, n: number) => {
    const big = N(u, v, 2, 3), fine = M(u, v, 16, 2);
    let col = mix([62, 112, 38], [112, 160, 64], big);
    col = mix(col, [140, 150, 70], Math.max(0, fine - 0.6) * 2);
    return mul(col, 0.82 + fine * 0.3 + (n - 0.5) * 0.12);
  };
  const dirtCol = (u: number, v: number, n: number) => {
    const big = N(u + 0.3, v, 4, 4), peb = M(u, v, 16, 1);
    let col = mix([92, 64, 42], [140, 102, 70], big);
    if (peb > 0.72) col = mix(col, [150, 140, 125], (peb - 0.72) * 4);
    return mul(col, 0.88 + (n - 0.5) * 0.18);
  };
  const stoneCol = (u: number, v: number, n: number) => {
    const big = N(u, v + 0.5, 3, 5), cr = Math.abs(M(u, v, 4, 3) - 0.5);
    let col = mix([96, 98, 100], [150, 150, 148], big);
    if (cr < 0.025) col = mul(col, 0.6);
    return mul(col, 0.9 + (n - 0.5) * 0.12);
  };
  put(0, grassCol);
  put(1, (u, v, n) => {
    const edge = 0.14 + N(u, 0.5, 8, 2) * 0.16;
    if (v < edge) return grassCol(u, v, n);
    const d = dirtCol(u, v, n);
    return v < edge + 0.05 ? mul(d, 0.75) : d;
  });
  put(2, dirtCol);
  put(3, stoneCol);
  // bark: vertical grain
  put(4, (u, v, n) => {
    const g = N(u * 1, v * 0.15, 8, 3), ridge = Math.abs(Math.sin((u * 6 + g * 1.5) * Math.PI));
    return mul(mix([62, 44, 28], [118, 88, 56], ridge * 0.8 + g * 0.3), 0.9 + (n - 0.5) * 0.15);
  });
  // log top: rings
  put(5, (u, v, n) => {
    const dx = u - 0.5, dy = v - 0.5, d = Math.hypot(dx, dy) + N(u, v, 4, 2) * 0.04;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 0.44) return mul([90, 66, 40], 0.9 + (n - 0.5) * 0.2);
    const ring = 0.5 + 0.5 * Math.sin(d * 70);
    return mul(mix([150, 112, 68], [192, 156, 104], ring), 0.95 + (n - 0.5) * 0.1);
  });
  put(6, (u, v, n) => {
    const l = M(u, v, 8, 3);
    if (l < 0.38) return [0, 0, 0, 0];
    return mul(mix([30, 78, 26], [86, 140, 50], N(u, v, 8, 3)), 0.75 + l * 0.5 + (n - 0.5) * 0.1);
  });
  put(7, (u, v, n) => mul(mix([200, 184, 136], [230, 218, 172], N(u, v, 8, 3)), 0.94 + (n - 0.5) * 0.14));
  put(8, (u, v, n) => {
    const row = Math.floor(v * 4), fv = v * 4 - row;
    if (fv > 0.93) return [70, 50, 30];
    const seam = (row % 2 ? 0.3 : 0.8);
    if (Math.abs(u - seam) < 0.012) return [80, 58, 34];
    const grain = N(u * 0.2 + row * 0.37, v * 3, 8, 3);
    return mul(mix([138, 104, 62], [186, 148, 96], grain), 0.92 + (n - 0.5) * 0.08);
  });
  put(9, (u, v, n) => {
    // irregular cobbles via cellular-ish noise
    const a = M(u, v, 4, 1), b = N(u, v, 8, 2);
    const edge = Math.abs(a - 0.5) < 0.04;
    const col = mix([90, 90, 92], [160, 158, 154], b);
    return mul(edge ? mul(col, 0.45) : col, 0.9 + (n - 0.5) * 0.15);
  });
  put(10, (u, v, n) => {
    const row = Math.floor(v * 8), off = row % 2 ? 0.125 : 0;
    const fv = v * 8 - row, fu = ((u + off) * 4) % 1;
    if (fv > 0.84 || fu > 0.94) return mul([180, 174, 162], 0.9 + N(u, v, 16, 2) * 0.2);
    const tint = M(Math.floor((u + off) * 4) / 4, row / 8, 4, 1);
    return mul(mix([128, 52, 40], [176, 84, 62], tint), 0.85 + N(u, v, 16, 3) * 0.3);
  });
  put(11, (u, v) => {
    const b = 1 / 16;
    if (u < b || v < b || u > 1 - b || v > 1 - b) return [200, 225, 232, 255];
    if (Math.abs(u - v - 0.1) < 0.03 && u > 0.15 && u < 0.45) return [240, 250, 255, 255];
    return [0, 0, 0, 0];
  });
  put(12, (u, v, n) => mul(mix([30, 30, 32], [90, 90, 90], N(u, v, 4, 4)), 0.9 + (n - 0.5) * 0.3));
  // tools: original 16px pixel art scaled up
  const px = (f: (x: number, y: number) => number[] | null) => (u: number, v: number) => f(Math.floor(u * 16), Math.floor(v * 16));
  const handle = (x: number, y: number) => x + y === 15 && x >= 2 && x <= 11;
  put(13, px((x, y) => {
    if ((y === 2 && x >= 6 && x <= 14) || (x === 13 && y >= 2 && y <= 9) || (y === 3 && x >= 8 && x <= 13) || (x === 12 && y >= 3 && y <= 7))
      return [170, 180, 190, 255];
    if (handle(x, y)) return [120, 85, 45, 255];
    return [0, 0, 0, 0];
  }));
  put(14, px((x, y) => {
    if (x >= 8 && x <= 13 && y >= 1 && y <= 6 && x + y >= 11) return [170, 180, 190, 255];
    if (handle(x, y)) return [120, 85, 45, 255];
    return [0, 0, 0, 0];
  }));
  put(15, px((x, y) => {
    if (x >= 10 && x <= 14 && y >= 1 && y <= 5 && Math.abs(x - 12) + Math.abs(y - 3) <= 3) return [170, 180, 190, 255];
    if (handle(x, y)) return [120, 85, 45, 255];
    return [0, 0, 0, 0];
  }));
  ctx.putImageData(img, 0, 0);
  return c;
}
