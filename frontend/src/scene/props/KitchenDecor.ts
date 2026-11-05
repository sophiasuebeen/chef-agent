import type { AssetPart } from '../../assets/registry';
import { cylinder, lathe, leafCluster, mergeStatic, seededRandom } from './geometry';

/** 카운터 위 허브 화분. 원점은 카운터 면. */
export const herbPotParts: AssetPart[] = [
  {
    material: 'terracotta',
    geometry: mergeStatic([
      lathe(
        [
          [0, 0],
          [0.05, 0],
          [0.07, 0.1],
          [0.075, 0.1],
          [0.078, 0.125],
          [0.062, 0.125],
          [0.06, 0.11],
          [0, 0.11],
        ],
        16,
      ),
    ]),
  },
  { material: 'soil', geometry: mergeStatic([cylinder(0.06, 0.06, 0.004, [0, 0.112, 0], 14)]), castShadow: false },
  {
    material: 'leaf',
    geometry: mergeStatic(leafCluster(seededRandom(61), [0, 0.2, 0], [0.09, 0.08, 0.09], 40, [0.024, 0.005, 0.014])),
  },
];
