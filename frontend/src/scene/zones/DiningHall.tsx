import { BufferAttribute, BufferGeometry, ExtrudeGeometry, Path, Shape, ShapeGeometry } from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  ARCHITECTURE,
  decor,
  hallTableSettings,
  KITCHEN,
  plates,
  tables,
  type Vec3,
  warmLights,
  WEST_BENCH,
} from '../../data/layout';
import { PlacedAssets } from '../props/Asset';
import { box, boxBetween, mergeStatic } from '../props/geometry';
import { TableSet, tablePlacements } from '../props/TableSet';
import { WarmLights } from '../props/WarmLights';
import { StaticMesh } from './StaticMesh';

const { hall, seaWall, skylight } = ARCHITECTURE;
const OUTER_MIN_X = hall.minX - hall.wallThickness;
const OUTER_MAX_X = hall.maxX + hall.wallThickness;
const KITCHEN_SIDE_Z = hall.minZ - hall.kitchenWallThickness;
const SEA_SIDE_Z = hall.maxZ + seaWall.thickness;
const OPENING_HALF = KITCHEN.halfWidth;

/** 벽을 지붕과 옆 벽 속으로 조금 밀어 넣어 이음매로 빛이 새지 않게 한다. */
const WALL_OVERLAP = 0.1;

/** 돌출 모서리를 둥글리고 곡면을 매끈하게 만들어 손으로 바른 회벽처럼 보이게 한다. */
function sculpted(shape: Shape, depth: number, curveSegments: number) {
  const radius = seaWall.edgeRadius;
  const geometry = new ExtrudeGeometry(shape, {
    depth: depth - radius * 2,
    bevelEnabled: true,
    bevelThickness: radius,
    bevelSize: radius,
    bevelOffset: -radius,
    bevelSegments: 3,
    curveSegments,
  });
  geometry.translate(0, 0, radius);
  return toCreasedNormals(geometry, Math.PI / 5);
}

/** 바닥 밑까지 내려 모서리 둥글림이 바닥 위로 드러나지 않게 한다. */
const FOOTING_Y = -0.15;

/** 아치가 바닥까지 열려 있으므로 구멍 대신 외곽선 자체를 아치로 파낸다. */
function buildSeaWall() {
  const { centersX, height, width } = seaWall.arch;
  const radius = width / 2;
  const springY = height - radius;
  const shape = new Shape();
  shape.moveTo(OUTER_MIN_X, FOOTING_Y);
  for (const centerX of centersX) {
    shape.lineTo(centerX - radius, FOOTING_Y);
    shape.lineTo(centerX - radius, springY);
    shape.absarc(centerX, springY, radius, Math.PI, 0, true);
    shape.lineTo(centerX + radius, FOOTING_Y);
  }
  shape.lineTo(OUTER_MAX_X, FOOTING_Y);
  shape.lineTo(OUTER_MAX_X, hall.height + WALL_OVERLAP);
  shape.lineTo(OUTER_MIN_X, hall.height + WALL_OVERLAP);
  shape.closePath();
  const geometry = sculpted(shape, seaWall.thickness, 28);
  geometry.translate(0, 0, hall.maxZ);
  return geometry;
}

/** 아치 창호의 금속 틀: 아치 둘레, 문설주, 상인방, 부채꼴 살. 가운데 문은 열려 있다. */
function buildArchFrames() {
  const { centersX, doorWidth, frameDepth, frameWidth, height, width } = seaWall.arch;
  const radius = width / 2;
  const springY = height - radius;
  const midZ = hall.maxZ + seaWall.thickness / 2;
  const halfDepth = frameDepth / 2;
  const parts: BufferGeometry[] = [];
  const column = (x: number, top: number) =>
    boxBetween([x - frameWidth / 2, 0, midZ - halfDepth], [x + frameWidth / 2, top, midZ + halfDepth]);

  for (const centerX of centersX) {
    parts.push(
      column(centerX - radius + frameWidth / 2, springY),
      column(centerX + radius - frameWidth / 2, springY),
      column(centerX - doorWidth / 2, springY),
      column(centerX + doorWidth / 2, springY),
      boxBetween(
        [centerX - radius, springY - frameWidth / 2, midZ - halfDepth],
        [centerX + radius, springY + frameWidth / 2, midZ + halfDepth],
      ),
    );
    // 아치 둘레
    const ring = new Shape();
    ring.absarc(centerX, springY, radius, 0, Math.PI, false);
    ring.lineTo(centerX - radius + frameWidth, springY);
    ring.absarc(centerX, springY, radius - frameWidth, Math.PI, 0, true);
    ring.closePath();
    const arc = new ExtrudeGeometry(ring, { depth: frameDepth, bevelEnabled: false, curveSegments: 28 });
    arc.translate(0, 0, midZ - halfDepth);
    parts.push(arc);
    // 부채꼴 살
    for (const angle of [Math.PI / 3, (2 * Math.PI) / 3]) {
      const bar = box(frameWidth * 0.8, radius, frameDepth);
      bar.translate(0, radius / 2, 0);
      bar.rotateZ(angle - Math.PI / 2);
      bar.translate(centerX, springY, midZ);
      parts.push(bar);
    }
  }
  return mergeStatic(parts);
}

/** 문 양옆과 상인방 위의 유리. 가운데 문 구멍은 비워 둔다. */
function buildArchGlass() {
  const { centersX, doorWidth, height, width } = seaWall.arch;
  const radius = width / 2;
  const springY = height - radius;
  const midZ = hall.maxZ + seaWall.thickness / 2;
  const parts: BufferGeometry[] = [];
  for (const centerX of centersX) {
    for (const side of [-1, 1]) {
      const inner = centerX + (side * doorWidth) / 2;
      const outer = centerX + side * radius;
      const [minX, maxX] = side < 0 ? [outer, inner] : [inner, outer];
      parts.push(boxBetween([minX, 0, midZ - 0.004], [maxX, springY, midZ + 0.004]));
    }
    const fan = new Shape();
    fan.absarc(centerX, springY, radius, 0, Math.PI, false);
    fan.closePath();
    const fanGeometry = new ShapeGeometry(fan, 28);
    fanGeometry.translate(0, 0, midZ);
    parts.push(fanGeometry);
  }
  return mergeStatic(parts);
}

/** 동쪽 벽: 니치는 벽을 관통해 파고, 바깥쪽 얇은 판으로 막아 깊이를 만든다. */
function buildEastWall() {
  const { eastNiches: niche } = hall;
  const radius = niche.width / 2;
  const springY = niche.bottom + niche.height - radius;
  const shape = new Shape();
  shape.moveTo(KITCHEN_SIDE_Z, 0);
  shape.lineTo(hall.maxZ + WALL_OVERLAP, 0);
  shape.lineTo(hall.maxZ + WALL_OVERLAP, hall.height + WALL_OVERLAP);
  shape.lineTo(KITCHEN_SIDE_Z, hall.height + WALL_OVERLAP);
  shape.closePath();
  for (const centerZ of niche.centersZ) {
    const hole = new Path();
    hole.moveTo(centerZ - radius, niche.bottom);
    hole.lineTo(centerZ + radius, niche.bottom);
    hole.lineTo(centerZ + radius, springY);
    hole.absarc(centerZ, springY, radius, 0, Math.PI, false);
    hole.closePath();
    shape.holes.push(hole);
  }
  const wall = sculpted(shape, niche.depth, 16);
  // 도형의 x를 월드 z로, 돌출 방향을 월드 -x로 돌린다.
  wall.rotateY(-Math.PI / 2);
  wall.translate(hall.maxX + niche.depth, 0, 0);
  return mergeStatic([
    wall,
    boxBetween(
      [hall.maxX + niche.depth, 0, KITCHEN_SIDE_Z],
      [OUTER_MAX_X, hall.height + WALL_OVERLAP, hall.maxZ + WALL_OVERLAP],
    ),
  ]);
}

function buildWalls() {
  const { entrance } = hall;
  const doorMinZ = entrance.z - entrance.width / 2;
  const doorMaxZ = entrance.z + entrance.width / 2;
  return mergeStatic([
    buildSeaWall(),
    // 주방 쪽 벽: 패스 개구부 양옆과 위
    boxBetween([OUTER_MIN_X, 0, KITCHEN_SIDE_Z], [-OPENING_HALF, hall.height + WALL_OVERLAP, hall.minZ]),
    boxBetween([OPENING_HALF, 0, KITCHEN_SIDE_Z], [OUTER_MAX_X, hall.height + WALL_OVERLAP, hall.minZ]),
    boxBetween(
      [-OPENING_HALF, KITCHEN.ceilingHeight, KITCHEN_SIDE_Z],
      [OPENING_HALF, hall.height + WALL_OVERLAP, hall.minZ],
    ),
    // 서쪽 벽: 출입구 양옆과 위
    boxBetween([OUTER_MIN_X, 0, KITCHEN_SIDE_Z], [hall.minX, hall.height + WALL_OVERLAP, doorMinZ]),
    boxBetween([OUTER_MIN_X, 0, doorMaxZ], [hall.minX, hall.height + WALL_OVERLAP, hall.maxZ + WALL_OVERLAP]),
    boxBetween([OUTER_MIN_X, entrance.height, doorMinZ], [hall.minX, hall.height + WALL_OVERLAP, doorMaxZ]),
    buildEastWall(),
  ]);
}

const SKYLIGHT = {
  minX: skylight.centerX - skylight.width / 2,
  maxX: skylight.centerX + skylight.width / 2,
  minZ: skylight.centerZ - skylight.depth / 2,
  maxZ: skylight.centerZ + skylight.depth / 2,
};
const ROOF_BOTTOM_Y = hall.height;
const ROOF_TOP_Y = hall.height + hall.roofThickness;
const RIDGE_Y = ROOF_TOP_Y + skylight.ridgeRise;

interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const COVE_SEGMENTS = 7;

function insetRect(rect: Rect, inset: number): Rect {
  return {
    minX: rect.minX + inset,
    maxX: rect.maxX - inset,
    minZ: rect.minZ + inset,
    maxZ: rect.maxZ - inset,
  };
}

/** 사각 둘레를 따라 안쪽으로 말려 올라가는 곡면. 아래에서 보이도록 면 방향을 맞춘다. */
function coveRing(outer: Rect, bottomY: number, radius: number) {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let segment = 0; segment <= COVE_SEGMENTS; segment += 1) {
    const angle = (segment / COVE_SEGMENTS) * (Math.PI / 2);
    const inset = radius * (1 - Math.cos(angle));
    const y = bottomY + radius * Math.sin(angle);
    const rect = insetRect(outer, inset);
    positions.push(
      rect.minX, y, rect.minZ,
      rect.maxX, y, rect.minZ,
      rect.maxX, y, rect.maxZ,
      rect.minX, y, rect.maxZ,
    );
  }
  for (let segment = 0; segment < COVE_SEGMENTS; segment += 1) {
    for (let corner = 0; corner < 4; corner += 1) {
      const next = (corner + 1) % 4;
      const a = segment * 4 + corner;
      const b = segment * 4 + next;
      const c = (segment + 1) * 4 + corner;
      const d = (segment + 1) * 4 + next;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** 평평한 천장 판. 구멍은 천창보다 곡면 폭만큼 크고, 곡면이 그 사이를 잇는다. */
function buildRoof() {
  const hole = insetRect(SKYLIGHT, -skylight.wellRadius);
  const interior: Rect = { minX: hall.minX, maxX: hall.maxX, minZ: hall.minZ, maxZ: hall.maxZ };
  return mergeStatic([
    boxBetween([OUTER_MIN_X, ROOF_BOTTOM_Y, KITCHEN_SIDE_Z], [OUTER_MAX_X, ROOF_TOP_Y, hole.minZ]),
    boxBetween([OUTER_MIN_X, ROOF_BOTTOM_Y, hole.maxZ], [OUTER_MAX_X, ROOF_TOP_Y, SEA_SIDE_Z]),
    boxBetween([OUTER_MIN_X, ROOF_BOTTOM_Y, hole.minZ], [hole.minX, ROOF_TOP_Y, hole.maxZ]),
    boxBetween([hole.maxX, ROOF_BOTTOM_Y, hole.minZ], [OUTER_MAX_X, ROOF_TOP_Y, hole.maxZ]),
    coveRing(hole, ROOF_BOTTOM_Y, skylight.wellRadius),
    coveRing(interior, ROOF_BOTTOM_Y - skylight.wallCoveRadius, skylight.wallCoveRadius),
  ]);
}

/** z 방향의 경사 부재. 두 끝의 (y, z)를 잇고 폭은 x로 잡는다. */
function slopedBeam(
  x: number,
  from: [y: number, z: number],
  to: [y: number, z: number],
  width: number,
  depth: number,
) {
  const dy = to[0] - from[0];
  const dz = to[1] - from[1];
  const beam = box(width, depth, Math.hypot(dy, dz));
  beam.rotateX(-Math.atan2(dy, dz));
  beam.translate(x, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2);
  return beam;
}

/** 타이 빔이 놓이는 x. 펜던트 배치와 같은 격자의 홀수 줄이다. */
function tieStationsX() {
  const stations: number[] = [];
  const lines = Math.round(skylight.width / skylight.mullionSpacing);
  for (let line = 1; line < lines; line += 2) stations.push(SKYLIGHT.minX + line * skylight.mullionSpacing);
  return stations;
}

/** 굵은 프레임: 타이 빔, 서까래, 용마루, 둘레 보. */
function buildFrame() {
  const { rafterDepth, rafterWidth, ridgeWidth, tieDepth, tieWidth } = skylight;
  const tieBottom = ROOF_TOP_Y - tieDepth;
  const parts: BufferGeometry[] = [];
  for (const x of tieStationsX()) {
    parts.push(
      boxBetween([x - tieWidth / 2, tieBottom, SKYLIGHT.minZ], [x + tieWidth / 2, ROOF_TOP_Y, SKYLIGHT.maxZ]),
      slopedBeam(x, [ROOF_TOP_Y, SKYLIGHT.minZ], [RIDGE_Y, skylight.centerZ], rafterWidth, rafterDepth),
      slopedBeam(x, [ROOF_TOP_Y, SKYLIGHT.maxZ], [RIDGE_Y, skylight.centerZ], rafterWidth, rafterDepth),
    );
  }
  // 양 끝 박공의 서까래
  for (const x of [SKYLIGHT.minX, SKYLIGHT.maxX]) {
    parts.push(
      slopedBeam(x, [ROOF_TOP_Y, SKYLIGHT.minZ], [RIDGE_Y, skylight.centerZ], rafterWidth, rafterDepth),
      slopedBeam(x, [ROOF_TOP_Y, SKYLIGHT.maxZ], [RIDGE_Y, skylight.centerZ], rafterWidth, rafterDepth),
    );
  }
  parts.push(
    // 용마루와 가운데 가로 타이
    boxBetween(
      [SKYLIGHT.minX, RIDGE_Y - ridgeWidth, skylight.centerZ - ridgeWidth / 2],
      [SKYLIGHT.maxX, RIDGE_Y, skylight.centerZ + ridgeWidth / 2],
    ),
    boxBetween(
      [SKYLIGHT.minX, tieBottom, skylight.centerZ - tieWidth / 2],
      [SKYLIGHT.maxX, ROOF_TOP_Y, skylight.centerZ + tieWidth / 2],
    ),
    // 유리를 받는 둘레 보
    boxBetween([SKYLIGHT.minX, tieBottom, SKYLIGHT.minZ - tieWidth], [SKYLIGHT.maxX, ROOF_TOP_Y, SKYLIGHT.minZ]),
    boxBetween([SKYLIGHT.minX, tieBottom, SKYLIGHT.maxZ], [SKYLIGHT.maxX, ROOF_TOP_Y, SKYLIGHT.maxZ + tieWidth]),
    boxBetween([SKYLIGHT.minX - tieWidth, tieBottom, SKYLIGHT.minZ], [SKYLIGHT.minX, ROOF_TOP_Y, SKYLIGHT.maxZ]),
    boxBetween([SKYLIGHT.maxX, tieBottom, SKYLIGHT.minZ], [SKYLIGHT.maxX + tieWidth, ROOF_TOP_Y, SKYLIGHT.maxZ]),
  );
  return mergeStatic(parts);
}

/** 가는 중도리: 유리를 나누는 x 방향 선. */
function buildPurlins() {
  const { purlinDepth, purlinSpacing, purlinWidth, ridgeRise } = skylight;
  const halfDepth = skylight.depth / 2;
  const slopeLength = Math.hypot(halfDepth, ridgeRise);
  const count = Math.floor(slopeLength / purlinSpacing);
  const parts: BufferGeometry[] = [];
  for (let index = 1; index <= count; index += 1) {
    const ratio = (index * purlinSpacing) / slopeLength;
    if (ratio >= 1) break;
    const y = ROOF_TOP_Y + ridgeRise * ratio;
    for (const side of [-1, 1]) {
      const z = skylight.centerZ + side * halfDepth * (1 - ratio);
      parts.push(
        boxBetween(
          [SKYLIGHT.minX, y - purlinDepth, z - purlinWidth / 2],
          [SKYLIGHT.maxX, y, z + purlinWidth / 2],
        ),
      );
    }
  }
  return mergeStatic(parts);
}

/** 삼각형 하나짜리 유리면. */
function glassTriangle(a: Vec3, b: Vec3, c: Vec3) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([...a, ...b, ...c]), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(6), 2));
  geometry.computeVertexNormals();
  return geometry;
}

function buildGlass() {
  const { centerZ } = skylight;
  const { maxX, maxZ, minX, minZ } = SKYLIGHT;
  const nw: Vec3 = [minX, ROOF_TOP_Y, minZ];
  const ne: Vec3 = [maxX, ROOF_TOP_Y, minZ];
  const se: Vec3 = [maxX, ROOF_TOP_Y, maxZ];
  const sw: Vec3 = [minX, ROOF_TOP_Y, maxZ];
  const ridgeW: Vec3 = [minX, RIDGE_Y, centerZ];
  const ridgeE: Vec3 = [maxX, RIDGE_Y, centerZ];
  return mergeStatic([
    glassTriangle(nw, ridgeW, ridgeE),
    glassTriangle(nw, ridgeE, ne),
    glassTriangle(sw, se, ridgeE),
    glassTriangle(sw, ridgeE, ridgeW),
    glassTriangle(nw, sw, ridgeW),
    glassTriangle(ne, ridgeE, se),
  ]);
}

function buildBenchPlinth() {
  const length = WEST_BENCH.segments * ARCHITECTURE.terrace.banquette.segmentLength;
  return boxBetween(
    [hall.minX, 0, WEST_BENCH.startZ],
    [hall.minX + WEST_BENCH.depth - 0.03, WEST_BENCH.plinthHeight, WEST_BENCH.startZ + length],
  );
}

function buildFloor() {
  return boxBetween([OUTER_MIN_X, -0.02, hall.minZ], [OUTER_MAX_X, 0, SEA_SIDE_Z]);
}

const hallTables = tables.filter((table) => table.zone === 'hall');
const hallSeatPlateIds = new Set(
  hallTables.flatMap((table) =>
    table.seats.map((seat) => seat.id.replace(/^seat\./, 'plate.')),
  ),
);
const hallPlates = plates.filter((plate) => hallSeatPlateIds.has(plate.id.replace(/\.(plate|pasta)$/, '')));
const hallPlacements = [...tablePlacements(hallTables), ...hallPlates, ...hallTableSettings, ...decor];

export function DiningHall() {
  return (
    <group name="zone.hall">
      <StaticMesh build={buildFloor} material="marbleFloor" castShadow={false} />
      <StaticMesh build={buildWalls} material="plaster" />
      <StaticMesh build={buildBenchPlinth} material="plaster" />
      <StaticMesh build={buildRoof} material="plaster" blocksPointer={false} cutaway />
      <StaticMesh build={buildArchFrames} material="frameSteelDark" blocksPointer={false} />
      <StaticMesh build={buildArchGlass} material="windowGlass" castShadow={false} blocksPointer={false} />
      <StaticMesh build={buildFrame} material="frameSteel" blocksPointer={false} cutaway />
      <StaticMesh build={buildPurlins} material="frameSteelDark" blocksPointer={false} cutaway />
      <StaticMesh build={buildGlass} material="skylightGlass" castShadow={false} blocksPointer={false} cutaway />

      {hallTables.map((table) => (
        <TableSet key={table.id} table={table} />
      ))}
      <PlacedAssets placements={hallPlacements} />
      <WarmLights placements={warmLights} />
    </group>
  );
}
