import { TorusGeometry } from 'three';
import type { AssetPart } from '../../assets/registry';
import { blob, lathe, mergeStatic, seededRandom } from './geometry';

/** 접시. 로컬 원점은 접시가 놓이는 면의 중심. */
export const dinnerPlateParts: AssetPart[] = [
  {
    material: 'ceramic',
    geometry: mergeStatic([
      lathe(
        [
          [0, 0],
          [0.08, 0],
          [0.09, 0.008],
          [0.125, 0.018],
          [0.125, 0.022],
          [0.09, 0.013],
          [0, 0.013],
        ],
        24,
      ),
    ]),
    castShadow: false,
  },
];

function buildPastaNest() {
  const random = seededRandom(42);
  const rings = [];
  for (let index = 0; index < 18; index += 1) {
    const ring = new TorusGeometry(0.018 + random() * 0.05, 0.0028, 4, 18);
    ring.rotateX(Math.PI / 2 + (random() - 0.5) * 0.7);
    ring.rotateZ((random() - 0.5) * 0.7);
    ring.translate((random() - 0.5) * 0.045, 0.02 + index * 0.0024, (random() - 0.5) * 0.045);
    rings.push(ring);
  }
  return mergeStatic(rings);
}

/** 접시 위에 올리는 레몬 파스타. 접시와 같은 원점을 쓴다. */
export const pastaParts: AssetPart[] = [
  { material: 'pasta', geometry: buildPastaNest(), castShadow: false },
  {
    material: 'leaf',
    geometry: mergeStatic([
      blob([0.018, 0.005, 0.011], [0.008, 0.068, 0.004], 0),
      blob([0.016, 0.005, 0.01], [-0.012, 0.066, -0.006], 0),
    ]),
    castShadow: false,
  },
];

function buildShrimp() {
  const random = seededRandom(7);
  const shrimp = [];
  for (let index = 0; index < 4; index += 1) {
    const angle = (index / 4) * Math.PI * 2 + 0.4;
    const body = new TorusGeometry(0.014, 0.0055, 5, 10, Math.PI * 1.35);
    body.rotateX(Math.PI / 2 + (random() - 0.5) * 0.5);
    body.rotateY(random() * Math.PI * 2);
    body.translate(Math.cos(angle) * 0.052, 0.054, Math.sin(angle) * 0.052);
    shrimp.push(body);
  }
  return mergeStatic(shrimp);
}

/** 접시 위에 올리는 해산물 토마토 파스타. 접시와 같은 원점을 쓴다. */
export const seafoodTomatoParts: AssetPart[] = [
  { material: 'pasta', geometry: buildPastaNest(), castShadow: false },
  {
    material: 'tomatoSauce',
    geometry: mergeStatic([
      blob([0.062, 0.012, 0.058], [0, 0.045, 0], 1),
      blob([0.03, 0.009, 0.026], [0.038, 0.034, -0.03], 0),
    ]),
    castShadow: false,
  },
  { material: 'shrimp', geometry: buildShrimp(), castShadow: false },
  {
    material: 'mussel',
    geometry: mergeStatic([
      blob([0.021, 0.008, 0.012], [-0.036, 0.058, 0.018], 0),
      blob([0.021, 0.008, 0.012], [0.014, 0.06, -0.038], 0),
    ]),
    castShadow: false,
  },
  {
    material: 'leaf',
    geometry: mergeStatic([
      blob([0.009, 0.003, 0.006], [0.004, 0.066, 0.008], 0),
      blob([0.008, 0.003, 0.006], [-0.012, 0.064, -0.008], 0),
    ]),
    castShadow: false,
  },
];
