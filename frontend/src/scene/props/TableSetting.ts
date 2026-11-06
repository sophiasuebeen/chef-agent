import type { AssetPart } from '../../assets/registry';
import { blob, cylinder, lathe, leafCluster, mergeStatic, roundedBox, seededRandom } from './geometry';

/** 테이블 위 소품. 로컬 원점은 소품이 놓이는 테이블 면. */

export const napkinParts: AssetPart[] = [
  { material: 'napkin', geometry: mergeStatic([roundedBox(0.075, 0.018, 0.19, 0.006, [0, 0.009, 0])]), castShadow: false },
];

export const wineGlassParts: AssetPart[] = [
  {
    material: 'wineGlass',
    geometry: mergeStatic([
      lathe(
        [
          [0, 0],
          [0.032, 0],
          [0.032, 0.002],
          [0.005, 0.008],
          [0.004, 0.085],
          [0.024, 0.105],
          [0.036, 0.135],
          [0.03, 0.175],
        ],
        14,
      ),
    ]),
    castShadow: false,
  },
];

export const oilBottleParts: AssetPart[] = [
  {
    material: 'oilGlass',
    geometry: mergeStatic([
      lathe(
        [
          [0, 0],
          [0.028, 0],
          [0.03, 0.01],
          [0.03, 0.13],
          [0.012, 0.165],
          [0.011, 0.21],
          [0, 0.21],
        ],
        12,
      ),
    ]),
  },
  { material: 'cork', geometry: mergeStatic([cylinder(0.011, 0.01, 0.02, [0, 0.22, 0], 8)]), castShadow: false },
];

const basketRandom = seededRandom(7);

export const breadBasketParts: AssetPart[] = [
  {
    material: 'wicker',
    geometry: mergeStatic([
      lathe(
        [
          [0, 0],
          [0.05, 0],
          [0.075, 0.035],
          [0.07, 0.038],
          [0.045, 0.012],
          [0, 0.012],
        ],
        16,
      ),
    ]),
  },
  {
    material: 'bread',
    geometry: mergeStatic(
      [0, 1, 2].map((index) => {
        const angle = (index / 3) * Math.PI * 2 + basketRandom();
        return blob([0.032, 0.02, 0.022], [Math.cos(angle) * 0.026, 0.034, Math.sin(angle) * 0.026]);
      }),
    ),
    castShadow: false,
  },
];

export const candleParts: AssetPart[] = [
  {
    material: 'ceramic',
    geometry: mergeStatic([cylinder(0.028, 0.032, 0.012, [0, 0.006, 0], 14), cylinder(0.011, 0.011, 0.1, [0, 0.062, 0], 10)]),
  },
  { material: 'flame', geometry: mergeStatic([blob([0.006, 0.014, 0.006], [0, 0.126, 0], 1)]), castShadow: false },
];

export const lemonVaseParts: AssetPart[] = [
  {
    material: 'ceramic',
    geometry: mergeStatic([
      lathe(
        [
          [0, 0],
          [0.03, 0],
          [0.045, 0.04],
          [0.04, 0.09],
          [0.028, 0.115],
          [0.033, 0.13],
          [0, 0.13],
        ],
        14,
      ),
    ]),
  },
  {
    material: 'lemon',
    geometry: mergeStatic([
      blob([0.027, 0.022, 0.022], [0.014, 0.148, 0.004]),
      blob([0.024, 0.02, 0.022], [-0.018, 0.152, -0.008]),
    ]),
    castShadow: false,
  },
  {
    material: 'leaf',
    geometry: mergeStatic(leafCluster(seededRandom(11), [0, 0.175, 0], [0.035, 0.02, 0.035], 7, [0.02, 0.004, 0.011])),
    castShadow: false,
  },
];

