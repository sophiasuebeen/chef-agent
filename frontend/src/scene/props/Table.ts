import { BufferAttribute, BufferGeometry } from 'three';
import type { AssetPart } from '../../assets/registry';
import { box, cylinder, mergeStatic, roundedBox } from './geometry';

const SURFACE_Y = 0.75;
const CLOTH_SEGMENTS = 128;
const CLOTH_ROWS = 8;
const CLOTH_DROP = 0.47;
const FOLD_COUNT = 13;

/**
 * 윗면과 늘어진 자락을 한 장으로 만든 식탁보. radiusAt은 각도별 윗면 가장자리까지의 거리.
 * 아래로 갈수록 주름이 깊어지고, cornerAt이 큰 곳은 더 길게 늘어진다.
 */
function linenCloth(radiusAt: (angle: number) => number, cornerAt: (angle: number) => number) {
  const positions: number[] = [0, SURFACE_Y, 0];
  const indices: number[] = [];
  for (let row = 0; row <= CLOTH_ROWS; row += 1) {
    const fall = row / CLOTH_ROWS;
    for (let segment = 0; segment < CLOTH_SEGMENTS; segment += 1) {
      const angle = (segment / CLOTH_SEGMENTS) * Math.PI * 2;
      const fold = 0.03 + 0.05 * Math.sin(angle * FOLD_COUNT + 1.7 * Math.sin(angle * 3));
      const radius = radiusAt(angle) * (1 + fall ** 1.25 * (0.03 + fold));
      // 가장자리에서 둥글게 꺾이도록 첫 줄들의 높이를 곡선으로 준다.
      const drop = CLOTH_DROP * (1 + 0.32 * cornerAt(angle)) * fall ** 1.15;
      positions.push(Math.cos(angle) * radius, SURFACE_Y - drop, Math.sin(angle) * radius);
    }
  }
  const vertex = (row: number, segment: number) => 1 + row * CLOTH_SEGMENTS + (segment % CLOTH_SEGMENTS);
  for (let segment = 0; segment < CLOTH_SEGMENTS; segment += 1) {
    indices.push(0, vertex(0, segment + 1), vertex(0, segment));
    for (let row = 0; row < CLOTH_ROWS; row += 1) {
      const upper = vertex(row, segment);
      const upperNext = vertex(row, segment + 1);
      const lower = vertex(row + 1, segment);
      const lowerNext = vertex(row + 1, segment + 1);
      indices.push(upper, upperNext, lower, upperNext, lowerNext, lower);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return mergeStatic([geometry]);
}

const SQUARE_HALF = 0.48;
const SQUARE_SOFTNESS = 14;

function squareRadius(angle: number) {
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  return SQUARE_HALF / (cos ** SQUARE_SOFTNESS + sin ** SQUARE_SOFTNESS) ** (1 / SQUARE_SOFTNESS);
}

function squareCorner(angle: number) {
  return 1 - Math.abs(Math.abs(Math.cos(angle)) - Math.abs(Math.sin(angle)));
}

/** 크롬 원판 받침. 식탁보 자락 아래로 보인다. */
const chromeBase: AssetPart = {
  material: 'steel',
  geometry: mergeStatic([
    cylinder(0.03, 0.035, SURFACE_Y - 0.03, [0, (SURFACE_Y - 0.03) / 2 + 0.02, 0], 14),
    cylinder(0.25, 0.28, 0.025, [0, 0.0125, 0], 32),
  ]),
};

export const squareTableParts: AssetPart[] = [
  { material: 'linen', geometry: linenCloth(squareRadius, squareCorner) },
  chromeBase,
];

export const roundTableParts: AssetPart[] = [
  { material: 'linen', geometry: linenCloth(() => 0.52, () => 0) },
  chromeBase,
];

/** 테라스의 대리석 슬래브. 오크 기둥 하나가 길쭉한 받침판 위에 선다. */
export const marbleSlabParts: AssetPart[] = [
  { material: 'marble', geometry: mergeStatic([roundedBox(1.3, 0.05, 0.8, 0.012, [0, SURFACE_Y - 0.025, 0])]) },
  {
    material: 'oak',
    geometry: mergeStatic([
      box(0.1, SURFACE_Y - 0.05, 0.1, [0, (SURFACE_Y - 0.05) / 2, 0]),
      box(0.6, 0.03, 0.42, [0, 0.015, 0]),
    ]),
  },
];
