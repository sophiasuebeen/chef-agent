/** Where the customer can walk, derived from the restaurant's layout data. No rendering here. */
import { ARCHITECTURE, TABLE_DIMENSIONS, decor, tables, terraceDecor } from '../data/layout.ts';

export type Obstacle =
  | { kind: 'box'; minX: number; maxX: number; minZ: number; maxZ: number }
  | { kind: 'circle'; x: number; z: number; radius: number };

export const PLAYER_RADIUS = 0.24;
export const PLAYER_SPEED = 2.6;
export const SPAWN: readonly [x: number, z: number] = [-6.6, 4.7];
/** The freestanding menu, beside the counter so it is seen on the way to order. */
export const MENU_BOARD: readonly [x: number, z: number] = [-4.05, 0.55];

const { hall, seaWall, terrace } = ARCHITECTURE;
const FAR = 1000;
const box = (minX: number, maxX: number, minZ: number, maxZ: number): Obstacle => ({ kind: 'box', minX, maxX, minZ, maxZ });

function structure(): Obstacle[] {
  const wallMinZ = hall.maxZ, wallMaxZ = terrace.minZ;
  const doors = seaWall.arch.centersX.map((x) => [x - seaWall.arch.doorWidth / 2, x + seaWall.arch.doorWidth / 2] as const);
  const walls: Obstacle[] = [
    box(-FAR, FAR, -FAR, 0.05), // Kitchen side, including the pass counter.
    box(-FAR, hall.minX, -FAR, wallMaxZ), // Hall west wall and beyond. The entrance stays closed.
    box(hall.maxX, FAR, -FAR, wallMaxZ),
    box(-FAR, terrace.minX + terrace.railingThickness, wallMaxZ, FAR),
    box(terrace.maxX - terrace.railingThickness, FAR, wallMaxZ, FAR),
    box(-FAR, FAR, terrace.maxZ - terrace.railingThickness - terrace.banquette.depth, FAR),
  ];
  let from: number = hall.minX;
  for (const [doorMin, doorMax] of doors) {
    walls.push(box(from, doorMin, wallMinZ, wallMaxZ));
    from = doorMax;
  }
  walls.push(box(from, hall.maxX, wallMinZ, wallMaxZ));
  return walls;
}

function furniture(): Obstacle[] {
  const radius = (shape: string) => shape === 'round' ? TABLE_DIMENSIONS.round.width / 2 : TABLE_DIMENSIONS.square.width * 0.72;
  const items: Obstacle[] = tables.flatMap((table) => [
    table.shape === 'terraceSlab'
      ? box(table.position[0] - TABLE_DIMENSIONS.terraceSlab.width / 2, table.position[0] + TABLE_DIMENSIONS.terraceSlab.width / 2,
        table.position[2] - TABLE_DIMENSIONS.terraceSlab.depth / 2, table.position[2] + TABLE_DIMENSIONS.terraceSlab.depth / 2)
      : { kind: 'circle' as const, x: table.position[0], z: table.position[2], radius: radius(table.shape) },
    ...table.seats.map((seat) => ({ kind: 'circle' as const, x: seat.position[0], z: seat.position[2], radius: 0.24 })),
  ]);
  const solid: Record<string, number> = {
    'tree.olive': 0.42, 'decor.lemonTree': 0.36, 'lamp.standing': 0.22, 'decor.floorVase': 0.24,
    'decor.bougainvillea': 0.3,
  };
  for (const placement of [...decor, ...terraceDecor]) {
    const size = solid[placement.assetId];
    if (size) items.push({ kind: 'circle', x: placement.position[0], z: placement.position[2], radius: size });
  }
  const bench = decor.filter((placement) => placement.assetId === 'decor.banquetteSegment').map((placement) => placement.position[2]);
  if (bench.length) items.push(box(hall.minX, hall.minX + 0.72, Math.min(...bench) - 0.1, Math.max(...bench) + 1.3));
  items.push({ kind: 'circle', x: MENU_BOARD[0], z: MENU_BOARD[1], radius: 0.36 });
  return items;
}

export const OBSTACLES: Obstacle[] = [...structure(), ...furniture()];

export function blocked(x: number, z: number, obstacles: Obstacle[] = OBSTACLES, radius = PLAYER_RADIUS): boolean {
  return obstacles.some((obstacle) => obstacle.kind === 'circle'
    ? Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.radius + radius
    : x > obstacle.minX - radius && x < obstacle.maxX + radius && z > obstacle.minZ - radius && z < obstacle.maxZ + radius);
}

/** Move as far as walls allow, sliding along them one axis at a time. */
export function step(x: number, z: number, dx: number, dz: number, obstacles: Obstacle[] = OBSTACLES): [x: number, z: number] {
  const nextX = blocked(x + dx, z, obstacles) ? x : x + dx;
  const nextZ = blocked(nextX, z + dz, obstacles) ? z : z + dz;
  return [nextX, nextZ];
}

/** Direction on the floor for movement keys, relative to where the camera looks. */
export function moveVector(forward: number, right: number, yaw: number): [dx: number, dz: number] {
  const length = Math.hypot(forward, right);
  if (!length) return [0, 0];
  const f = forward / length, r = right / length;
  return [-Math.sin(yaw) * f + Math.cos(yaw) * r, -Math.cos(yaw) * f - Math.sin(yaw) * r];
}

export type Zone = 'counter' | 'menu' | null;
const COUNTER_HALF_WIDTH = 3.4;
const COUNTER_REACH = 1.9;
const MENU_REACH = 1.5;

/** What the customer can do from here. The menu wins when both are in reach. */
export function zoneAt(x: number, z: number): Zone {
  if (Math.hypot(x - MENU_BOARD[0], z - MENU_BOARD[1]) < MENU_REACH) return 'menu';
  if (Math.abs(x) < COUNTER_HALF_WIDTH && z < COUNTER_REACH) return 'counter';
  return null;
}

/** Keep the camera inside the room the customer is in, so walls never come between them. */
export function clampCamera(x: number, z: number, playerZ: number): [x: number, z: number] {
  const inset = 0.45;
  if (playerZ < terrace.minZ - 0.3) {
    return [Math.max(hall.minX + inset, Math.min(hall.maxX - inset, x)), Math.max(0.3, Math.min(hall.maxZ - inset, z))];
  }
  return [Math.max(terrace.minX + inset, Math.min(terrace.maxX - inset, x)), Math.max(terrace.minZ + inset, z)];
}
