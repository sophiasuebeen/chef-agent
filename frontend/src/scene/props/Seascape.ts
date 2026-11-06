import { type BufferGeometry, Shape, ShapeGeometry } from 'three';
import type { AssetPart } from '../../assets/registry';
import type { Vec3 } from '../../data/layout';
import { blob, box, cylinder, mergeStatic, seededRandom } from './geometry';

const SHRUB_BLOBS: { radii: Vec3; center: Vec3 }[] = [
  { radii: [0.62, 0.5, 0.58], center: [0, 0.42, 0] },
  { radii: [0.46, 0.4, 0.46], center: [0.58, 0.32, 0.1] },
  { radii: [0.42, 0.38, 0.44], center: [-0.55, 0.3, -0.05] },
  { radii: [0.36, 0.34, 0.36], center: [0.1, 0.72, 0.18] },
];

/** 난간 너머 턱에 자라는 둥근 수풀. 원점은 바닥. */
export const shrubParts: AssetPart[] = [
  {
    material: 'shrub',
    geometry: mergeStatic(SHRUB_BLOBS.map(({ center, radii }) => blob(radii, center, 1))),
    castShadow: false,
  },
];

const HULL_LENGTH = 14;
const MAST_HEIGHT = 17;

function sail(front: number, back: number, height: number, baseY: number, depthZ: number): BufferGeometry {
  const shape = new Shape();
  shape.moveTo(front, baseY);
  shape.lineTo(back, baseY);
  shape.lineTo(0, baseY + height);
  shape.closePath();
  const geometry = new ShapeGeometry(shape);
  geometry.translate(0, 0, depthZ);
  return geometry;
}

/** 요트. 원점은 수면, 길이 방향은 x. */
export const yachtParts: AssetPart[] = [
  {
    material: 'ceramic',
    geometry: mergeStatic([
      box(HULL_LENGTH, 1.3, 3.4, [0, 0.65, 0]),
      box(4.5, 1, 2.4, [-1, 1.8, 0]),
      // 양면으로 보이도록 돛을 앞뒤로 겹친다.
      sail(0.3, 6.2, MAST_HEIGHT - 2, 2, 0.02),
      sail(6.2, 0.3, MAST_HEIGHT - 2, 2, -0.02),
      sail(-0.3, -5, MAST_HEIGHT - 3.5, 2, 0.02),
      sail(-5, -0.3, MAST_HEIGHT - 3.5, 2, -0.02),
    ]),
    castShadow: false,
  },
  {
    material: 'walnut',
    geometry: mergeStatic([cylinder(0.08, 0.1, MAST_HEIGHT, [0, MAST_HEIGHT / 2 + 1, 0], 6)]),
    castShadow: false,
  },
];

/** 수평선의 낮은 섬. 원점은 해수면이고 아랫부분은 물에 잠긴다. */
export const islandParts: AssetPart[] = [
  {
    material: 'island',
    geometry: mergeStatic([
      blob([300, 22, 70], [0, 0, 0], 3),
      blob([150, 36, 50], [-60, 0, 10], 2),
      blob([120, 18, 40], [180, 0, -10], 2),
    ]),
    castShadow: false,
  },
];

const cloudRandom = seededRandom(303);

/** 납작한 뭉게구름. 안개의 영향을 받지 않는다. */
export const cloudParts: AssetPart[] = [
  {
    material: 'cloud',
    geometry: mergeStatic(
      Array.from({ length: 7 }, (_, index) => {
        const x = (index - 3) * 34 + (cloudRandom() - 0.5) * 12;
        const reach = 1 - Math.abs(index - 3) / 4.5;
        return blob(
          [48 + 26 * reach, 9 + 15 * reach * cloudRandom() + 5, 28],
          [x, 4 * reach, (cloudRandom() - 0.5) * 18],
          2,
        );
      }),
    ),
    castShadow: false,
  },
];
