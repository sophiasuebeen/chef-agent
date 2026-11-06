import type { BufferGeometry } from 'three';
import type { AssetPart } from '../../assets/registry';
import type { Vec3 } from '../../data/layout';
import { cylinder, lathe, leafCluster, limb, mergeStatic, seededRandom } from './geometry';

const PLANTER_HEIGHT = 0.46;
const PLANTER_RADIUS = 0.86;
const SOIL_Y = PLANTER_HEIGHT - 0.05;

const TRUNK_LIMBS = 3;
const TRUNK_TOP_Y = 2.05;
const BRANCHES_PER_LIMB = 4;
const TWIGS_PER_BRANCH = 3;
const LEAF_SIZE: Vec3 = [0.062, 0.006, 0.02];
const LEAVES_PER_TWIG = 64;
const FOLIAGE_SPREAD: Vec3 = [0.52, 0.32, 0.52];

interface TreeShape {
  wood: BufferGeometry[];
  tips: Vec3[];
}

/** 세 줄기가 비틀려 올라가는 굵은 고목. 가지와 잔가지를 시드 난수로 뻗는다. */
function growTree(): TreeShape {
  const random = seededRandom(4242);
  const wood: BufferGeometry[] = [];
  const tips: Vec3[] = [];
  for (let limbIndex = 0; limbIndex < TRUNK_LIMBS; limbIndex += 1) {
    const baseAngle = (limbIndex / TRUNK_LIMBS) * Math.PI * 2;
    let previous: Vec3 = [Math.cos(baseAngle) * 0.13, SOIL_Y, Math.sin(baseAngle) * 0.13];
    const steps = 5;
    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps;
      const twist = baseAngle + progress * 1.5;
      const spread = 0.1 + 0.2 * progress ** 2;
      const next: Vec3 = [
        Math.cos(twist) * spread + (random() - 0.5) * 0.05,
        SOIL_Y + (TRUNK_TOP_Y - SOIL_Y) * progress,
        Math.sin(twist) * spread + (random() - 0.5) * 0.05,
      ];
      wood.push(limb(previous, next, 0.17 - 0.09 * (progress - 1 / steps), 0.17 - 0.09 * progress, 8));
      previous = next;
    }
    for (let branchIndex = 0; branchIndex < BRANCHES_PER_LIMB; branchIndex += 1) {
      const angle = baseAngle + (branchIndex / BRANCHES_PER_LIMB) * 2.1 - 1 + (random() - 0.5) * 0.4;
      const reach = 0.75 + random() * 0.65;
      const branchTip: Vec3 = [
        previous[0] + Math.cos(angle) * reach,
        previous[1] + 0.65 + random() * 0.85,
        previous[2] + Math.sin(angle) * reach,
      ];
      wood.push(limb(previous, branchTip, 0.075, 0.03, 6));
      for (let twigIndex = 0; twigIndex < TWIGS_PER_BRANCH; twigIndex += 1) {
        const twigAngle = angle + (twigIndex - 1) * 0.9 + (random() - 0.5) * 0.4;
        const twigReach = 0.32 + random() * 0.4;
        const tip: Vec3 = [
          branchTip[0] + Math.cos(twigAngle) * twigReach,
          branchTip[1] + (random() - 0.2) * 0.42,
          branchTip[2] + Math.sin(twigAngle) * twigReach,
        ];
        wood.push(limb(branchTip, tip, 0.028, 0.009, 5));
        tips.push(tip);
      }
    }
  }
  return { wood, tips };
}

const tree = growTree();

function buildLeaves(seed: number) {
  const random = seededRandom(seed);
  return mergeStatic(
    tree.tips.flatMap((tip) => leafCluster(random, tip, FOLIAGE_SPREAD, LEAVES_PER_TWIG, LEAF_SIZE)),
  );
}

/** 작은 은록색 잎이 빽빽한 올리브 고목과 흰 원형 화분. 원점은 화분 바닥 중심. */
export const oliveTreeParts: AssetPart[] = [
  {
    material: 'plaster',
    geometry: mergeStatic([
      lathe(
        [
          [0, 0],
          [PLANTER_RADIUS - 0.03, 0],
          [PLANTER_RADIUS, PLANTER_HEIGHT - 0.05],
          [PLANTER_RADIUS - 0.015, PLANTER_HEIGHT - 0.012],
          [PLANTER_RADIUS - 0.05, PLANTER_HEIGHT],
          [PLANTER_RADIUS - 0.085, PLANTER_HEIGHT - 0.012],
          [PLANTER_RADIUS - 0.1, PLANTER_HEIGHT - 0.06],
        ],
        48,
      ),
    ]),
  },
  {
    material: 'darkSoil',
    geometry: mergeStatic([cylinder(PLANTER_RADIUS - 0.08, PLANTER_RADIUS - 0.08, 0.02, [0, SOIL_Y, 0], 40)]),
    castShadow: false,
  },
  { material: 'oliveBark', geometry: mergeStatic(tree.wood) },
  { material: 'oliveLeaf', geometry: buildLeaves(1907) },
  { material: 'oliveLeafPale', geometry: buildLeaves(1908), castShadow: false },
];
