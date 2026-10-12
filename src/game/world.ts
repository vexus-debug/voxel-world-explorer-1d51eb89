// Hot numeric voxel loops: index-signature strictness is disabled here for readability.
// @ts-nocheck
import * as THREE from "three";
import { B, BLOCKS, ATLAS_COLS, isTransparent } from "./blocks";

export const CH = 16;
export const H = 64;

export function hash2(x: number, z: number, seed: number) {
  let h = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function noise(x: number, z: number, seed: number) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi, seed), b = hash2(xi + 1, zi, seed);
  const c = hash2(xi, zi + 1, seed), d = hash2(xi + 1, zi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, z: number, seed: number, oct: number) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += noise(x * f, z * f, seed + i * 31) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return s / norm;
}

const idx = (x: number, y: number, z: number) => (y * CH + z) * CH + x;
export const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;

export type Edits = Record<string, Record<number, number>>;

export class World {
  chunks = new Map<string, Uint8Array>();
  versions = new Map<string, number>();
  constructor(public seed: number, public edits: Edits = {}) {}

  height(x: number, z: number) {
    const n = fbm(x / 48, z / 48, this.seed, 4);
    const m = fbm(x / 170, z / 170, this.seed + 7, 2);
    return Math.max(4, Math.min(H - 10, Math.floor(6 + n * 20 + m * 22)));
  }

  getChunk(cx: number, cz: number) {
    const k = chunkKey(cx, cz);
    let c = this.chunks.get(k);
    if (!c) {
      c = this.generate(cx, cz);
      this.chunks.set(k, c);
    }
    return c;
  }

  private generate(cx: number, cz: number) {
    const c = new Uint8Array(CH * H * CH);
    const heights: number[] = [];
    for (let z = 0; z < CH; z++)
      for (let x = 0; x < CH; x++) {
        const wx = cx * CH + x, wz = cz * CH + z;
        const h = this.height(wx, wz);
        heights[z * CH + x] = h;
        const beach = h <= 18;
        for (let y = 0; y <= h; y++) {
          let id: number = B.STONE;
          if (y === 0) id = B.BEDROCK;
          else if (y >= h - 3) id = y === h ? (beach ? B.SAND : B.GRASS) : beach ? B.SAND : B.DIRT;
          c[idx(x, y, z)] = id;
        }
      }
    // trees (kept inside the chunk)
    for (let z = 2; z < CH - 2; z++)
      for (let x = 2; x < CH - 2; x++) {
        const wx = cx * CH + x, wz = cz * CH + z;
        const h = heights[z * CH + x];
        if (c[idx(x, h, z)] !== B.GRASS || hash2(wx, wz, this.seed + 3) > 0.018) continue;
        const th = 4 + Math.floor(hash2(wx, wz, this.seed + 5) * 2);
        for (let dy = -2; dy <= 1; dy++) {
          const r = dy >= 0 ? 1 : 2;
          for (let dz = -r; dz <= r; dz++)
            for (let dx = -r; dx <= r; dx++) {
              if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
              const y = h + th + dy;
              if (y < H && c[idx(x + dx, y, z + dz)] === 0) c[idx(x + dx, y, z + dz)] = B.LEAVES;
            }
        }
        for (let y = h + 1; y <= h + th; y++) c[idx(x, y, z)] = B.LOG;
        c[idx(x, h, z)] = B.DIRT;
      }
    const e = this.edits[chunkKey(cx, cz)];
    if (e) for (const k in e) c[+k] = e[k];
    return c;
  }

  get(x: number, y: number, z: number) {
    if (y < 0) return B.BEDROCK;
    if (y >= H) return 0;
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
    return this.getChunk(cx, cz)[idx(x - cx * CH, y, z - cz * CH)];
  }

  set(x: number, y: number, z: number, id: number) {
    if (y < 1 || y >= H) return;
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
    const lx = x - cx * CH, lz = z - cz * CH;
    const k = chunkKey(cx, cz);
    const i = idx(lx, y, lz);
    this.getChunk(cx, cz)[i] = id;
    (this.edits[k] ??= {})[i] = id;
    this.bump(cx, cz);
    if (lx === 0) this.bump(cx - 1, cz);
    if (lx === CH - 1) this.bump(cx + 1, cz);
    if (lz === 0) this.bump(cx, cz - 1);
    if (lz === CH - 1) this.bump(cx, cz + 1);
  }

  bump(cx: number, cz: number) {
    const k = chunkKey(cx, cz);
    this.versions.set(k, (this.versions.get(k) ?? 0) + 1);
  }
  version(cx: number, cz: number) {
    return this.versions.get(chunkKey(cx, cz)) ?? 0;
  }

  surface(x: number, z: number) {
    for (let y = H - 1; y > 0; y--) if (this.get(x, y, z) !== 0) return y + 1;
    return H;
  }
}

// ---------- Meshing ----------
const FACES = [
  { d: [-1, 0, 0], s: 0.8, c: [[0, 1, 0, 0, 1], [0, 0, 0, 0, 0], [0, 1, 1, 1, 1], [0, 0, 1, 1, 0]] },
  { d: [1, 0, 0], s: 0.8, c: [[1, 1, 1, 0, 1], [1, 0, 1, 0, 0], [1, 1, 0, 1, 1], [1, 0, 0, 1, 0]] },
  { d: [0, -1, 0], s: 0.5, c: [[1, 0, 1, 1, 0], [0, 0, 1, 0, 0], [1, 0, 0, 1, 1], [0, 0, 0, 0, 1]] },
  { d: [0, 1, 0], s: 1, c: [[0, 1, 1, 1, 1], [1, 1, 1, 0, 1], [0, 1, 0, 1, 0], [1, 1, 0, 0, 0]] },
  { d: [0, 0, -1], s: 0.65, c: [[1, 0, 0, 0, 0], [0, 0, 0, 1, 0], [1, 1, 0, 0, 1], [0, 1, 0, 1, 1]] },
  { d: [0, 0, 1], s: 0.65, c: [[0, 0, 1, 0, 0], [1, 0, 1, 1, 0], [0, 1, 1, 0, 1], [1, 1, 1, 1, 1]] },
];

const AO = [1, 0.78, 0.6, 0.45];
const solid = (id: number) => (id !== 0 && !isTransparent(id) ? 1 : 0);

export function buildChunkGeometry(world: World, cx: number, cz: number) {
  const chunk = world.getChunk(cx, cz);
  const pos: number[] = [], uv: number[] = [], col: number[] = [], ind: number[] = [];
  const ox = cx * CH, oz = cz * CH;
  const eps = 0.001;
  for (let y = 0; y < H; y++)
    for (let z = 0; z < CH; z++)
      for (let x = 0; x < CH; x++) {
        const id = chunk[idx(x, y, z)];
        if (!id) continue;
        const def = BLOCKS[id];
        for (let f = 0; f < 6; f++) {
          const F = FACES[f];
          const nx = x + F.d[0], ny = y + F.d[1], nz = z + F.d[2];
          const n =
            nx >= 0 && nx < CH && nz >= 0 && nz < CH
              ? ny < 0 ? 1 : ny >= H ? 0 : chunk[idx(nx, ny, nz)]
              : world.get(ox + nx, ny, oz + nz);
          if (!(isTransparent(n) && n !== id)) continue;
          const tile = f === 3 ? def.tiles[0] : f === 2 ? def.tiles[2] : def.tiles[1];
          const tc = tile % ATLAS_COLS, tr = Math.floor(tile / ATLAS_COLS);
          const base = pos.length / 3;
          const ao: number[] = [];
          for (const c of F.c) {
            // vertex ambient occlusion: sample the 3 neighbours around this corner on the face's outer side
            const sx = c[0] * 2 - 1, sy = c[1] * 2 - 1, sz = c[2] * 2 - 1;
            const ax = F.d[0] ? 0 : sx, ay = F.d[1] ? 0 : sy, az = F.d[2] ? 0 : sz;
            const bx = ox + nx, by = ny, bz = oz + nz;
            // two tangent axes
            const t1 = F.d[0] ? [0, ay, 0] : [ax, 0, 0];
            const t2 = F.d[2] ? [0, ay, 0] : [0, 0, az];
            const s1 = solid(world.get(bx + t1[0], by + t1[1], bz + t1[2]));
            const s2 = solid(world.get(bx + t2[0], by + t2[1], bz + t2[2]));
            const sc = solid(world.get(bx + t1[0] + t2[0], by + t1[1] + t2[1], bz + t1[2] + t2[2]));
            const occ = s1 && s2 ? 3 : s1 + s2 + sc;
            ao.push(AO[occ]);
          }
          let k = 0;
          for (const c of F.c) {
            pos.push(ox + x + c[0], y + c[1], oz + z + c[2]);
            const u = (tc + (c[3] ? 1 - eps : eps)) / ATLAS_COLS;
            const v = 1 - (tr + 1 - (c[4] ? 1 - eps : eps)) / ATLAS_COLS;
            uv.push(u, v);
            const l = F.s * ao[k++];
            col.push(l, l, l);
          }
          // flip quad diagonal to avoid anisotropic AO artifacts
          if (ao[0] + ao[3] < ao[1] + ao[2]) ind.push(base, base + 1, base + 3, base, base + 3, base + 2);
          else ind.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
        }
      }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(ind);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// ---------- Physics helpers ----------
export function collides(world: World, p: THREE.Vector3, hw: number, h: number) {
  const e = 0.001;
  for (let x = Math.floor(p.x - hw + e); x <= Math.floor(p.x + hw - e); x++)
    for (let y = Math.floor(p.y + e); y <= Math.floor(p.y + h - e); y++)
      for (let z = Math.floor(p.z - hw + e); z <= Math.floor(p.z + hw - e); z++)
        if (world.get(x, y, z) !== 0) return true;
  return false;
}

export function moveEntity(world: World, p: THREE.Vector3, v: THREE.Vector3, dt: number, hw: number, h: number) {
  let onGround = false, hitWall = false;
  const steps = Math.max(1, Math.ceil((Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * dt) / 0.2));
  const sdt = dt / steps;
  for (let s = 0; s < steps; s++)
    for (const a of ["x", "y", "z"] as const) {
      const d = v[a] * sdt;
      if (!d) continue;
      p[a] += d;
      if (collides(world, p, hw, h)) {
        p[a] -= d;
        if (a === "y") {
          if (v.y < 0) onGround = true;
        } else hitWall = true;
        v[a] = 0;
      }
    }
  return { onGround, hitWall };
}

export function raycast(world: World, o: THREE.Vector3, d: THREE.Vector3, max: number) {
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
  const tdx = Math.abs(1 / d.x), tdy = Math.abs(1 / d.y), tdz = Math.abs(1 / d.z);
  let tx = sx > 0 ? (x + 1 - o.x) * tdx : sx < 0 ? (o.x - x) * tdx : Infinity;
  let ty = sy > 0 ? (y + 1 - o.y) * tdy : sy < 0 ? (o.y - y) * tdy : Infinity;
  let tz = sz > 0 ? (z + 1 - o.z) * tdz : sz < 0 ? (o.z - z) * tdz : Infinity;
  let prev: [number, number, number] = [x, y, z];
  let t = 0;
  while (t <= max) {
    const id = world.get(x, y, z);
    if (id !== 0) return { pos: [x, y, z] as [number, number, number], prev, id, dist: t };
    prev = [x, y, z];
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; }
    else if (ty < tz) { y += sy; t = ty; ty += tdy; }
    else { z += sz; t = tz; tz += tdz; }
  }
  return null;
}
