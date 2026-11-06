import { PlaneGeometry, type BufferGeometry } from 'three';
import type { AssetPart } from '../../assets/registry';
import type { Vec3 } from '../../data/layout';
import { blob, box, cylinder, lathe, leafCluster, limb, mergeStatic, roundedBox, seededRandom } from './geometry';

/** 테이블 위의 작은 꽃병. 원점은 테이블 면. */
const flowerRandom = seededRandom(31);
const FLOWER_TIPS: Vec3[] = [0, 1, 2, 3].map((index) => {
  const angle = (index / 4) * Math.PI * 2 + 0.4;
  const lean = 0.025 + flowerRandom() * 0.02;
  return [Math.cos(angle) * lean, 0.16 + flowerRandom() * 0.05, Math.sin(angle) * lean];
});

export const flowerVaseParts: AssetPart[] = [
  {
    material: 'ceramic',
    geometry: mergeStatic([
      lathe(
        [
          [0, 0],
          [0.022, 0],
          [0.034, 0.03],
          [0.028, 0.07],
          [0.014, 0.09],
          [0.018, 0.1],
          [0, 0.1],
        ],
        12,
      ),
    ]),
  },
  {
    material: 'leaf',
    geometry: mergeStatic(FLOWER_TIPS.map((tip) => limb([0, 0.09, 0], tip, 0.002, 0.0015, 4))),
    castShadow: false,
  },
  {
    material: 'flowerBlue',
    geometry: mergeStatic(FLOWER_TIPS.map((tip) => blob([0.014, 0.014, 0.014], tip, 1))),
    castShadow: false,
  },
];

/** 와인 아이스버킷과 병. 원점은 테이블 면. */
export const iceBucketParts: AssetPart[] = [
  {
    material: 'steel',
    geometry: mergeStatic([
      lathe(
        [
          [0, 0],
          [0.068, 0],
          [0.085, 0.17],
          [0.09, 0.18],
          [0.08, 0.18],
          [0.066, 0.02],
          [0, 0.02],
        ],
        20,
      ),
    ]),
  },
  {
    material: 'wineBottle',
    geometry: mergeStatic([limb([0, 0.03, 0], [0.015, 0.24, 0], 0.036, 0.034, 10), limb([0.015, 0.24, 0], [0.024, 0.34, 0], 0.016, 0.013, 8)]),
  },
];

const SAIL_HALF_WIDTH = 2.6;
const SAIL_WALL_Z = -3.2;
const SAIL_RAIL_Z = 3.1;
const SAIL_WALL_Y = 4.4;
const SAIL_RAIL_Y = 3.1;
const SAIL_SAG = 0.28;

function buildSail(): BufferGeometry {
  const geometry = new PlaneGeometry(1, 1, 16, 16);
  const position = geometry.getAttribute('position');
  for (let index = 0; index < position.count; index += 1) {
    const u = position.getX(index) + 0.5;
    const v = position.getY(index) + 0.5;
    const sag = SAIL_SAG * Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(v, 1));
    position.setXYZ(
      index,
      // 벽 쪽 두 모서리에서 난간 쪽 한 점으로 모이는 삼각 돛.
      (u - 0.5) * 2 * SAIL_HALF_WIDTH * (1 - v),
      SAIL_WALL_Y + (SAIL_RAIL_Y - SAIL_WALL_Y) * v - sag,
      SAIL_WALL_Z + (SAIL_RAIL_Z - SAIL_WALL_Z) * v,
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** 흰 삼각 차양 돛. 원점은 테라스 바닥 중앙이고, 벽 쪽(-z)이 높고 난간 쪽(+z) 끝을 기둥 하나가 받친다. */
export const shadeSailParts: AssetPart[] = [
  { material: 'sailcloth', geometry: mergeStatic([buildSail()]) },
  {
    material: 'plaster',
    geometry: mergeStatic([cylinder(0.035, 0.04, SAIL_RAIL_Y, [0, SAIL_RAIL_Y / 2, SAIL_RAIL_Z], 10)]),
  },
];

const lemonRandom = seededRandom(77);
const LEMON_CROWN_Y = 1.75;
const lemons = Array.from({ length: 16 }, () => {
  const angle = lemonRandom() * Math.PI * 2;
  const elevation = lemonRandom() * 1.1 - 0.35;
  const radius = 0.5;
  return blob(
    [0.05, 0.045, 0.045],
    [
      Math.cos(angle) * Math.cos(elevation) * radius,
      LEMON_CROWN_Y + Math.sin(elevation) * radius * 0.9,
      Math.sin(angle) * Math.cos(elevation) * radius,
    ],
  );
});

/** 화이트 플랜터의 레몬 나무. 원점은 바닥. */
export const lemonTreeParts: AssetPart[] = [
  {
    material: 'terracottaWhite',
    geometry: mergeStatic([
      roundedBox(0.62, 0.55, 0.62, 0.02, [0, 0.275, 0]),
      box(0.68, 0.05, 0.68, [0, 0.56, 0]),
    ]),
  },
  {
    material: 'bark',
    geometry: mergeStatic([limb([0, 0.55, 0], [0.02, LEMON_CROWN_Y, 0], 0.05, 0.03, 8)]),
  },
  {
    material: 'leaf',
    geometry: mergeStatic(leafCluster(seededRandom(78), [0, LEMON_CROWN_Y, 0], [0.55, 0.5, 0.55], 230, [0.06, 0.012, 0.035])),
  },
  { material: 'lemon', geometry: mergeStatic(lemons), castShadow: false },
];

const CLIMB_POINTS: Vec3[] = [
  [0, 0.5, 0.1],
  [0.16, 1.3, 0.1],
  [-0.12, 2.1, 0.1],
  [0.18, 2.9, 0.1],
  [0, 3.65, 0.1],
];

const climbRandom = seededRandom(19);

/** 외벽을 타고 오르는 부겐빌레아. 원점은 벽과 바닥이 만나는 곳, 앞면이 +z. */
export const bougainvilleaParts: AssetPart[] = [
  {
    material: 'bark',
    geometry: mergeStatic(
      CLIMB_POINTS.slice(1).map((point, index) =>
        limb(CLIMB_POINTS[index] ?? point, point, 0.022, 0.015, 5),
      ),
    ),
    castShadow: false,
  },
  {
    material: 'leaf',
    geometry: mergeStatic(
      CLIMB_POINTS.flatMap((point) => leafCluster(climbRandom, point, [0.55, 0.55, 0.14], 42, [0.055, 0.012, 0.032])),
    ),
    castShadow: false,
  },
  {
    material: 'bougainvillea',
    geometry: mergeStatic(
      CLIMB_POINTS.flatMap((point) => leafCluster(climbRandom, [point[0], point[1], 0.16], [0.62, 0.58, 0.14], 105, [0.045, 0.012, 0.032])),
    ),
    castShadow: false,
  },
];
