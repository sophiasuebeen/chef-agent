import { BufferAttribute, PlaneGeometry, type BufferGeometry } from 'three';
import type { AssetPart } from '../../assets/registry';
import type { Vec3 } from '../../data/layout';
import { PAINTED_PLATE_RADIUS, WALL_ART_HEIGHT, WALL_ART_WIDTH } from '../materials/textures';
import { blob, box, cylinder, leafCluster, limb, mergeStatic, seededRandom } from './geometry';

const CURTAIN_HEIGHT = 3.72;
const CURTAIN_TOP_WIDTH = 0.56;
const CURTAIN_HEM_WIDTH = 0.66;
const CURTAIN_COLUMNS = 132;
const CURTAIN_ROWS = 14;
const PLEATS = 5.5;
const PLEAT_DEPTH = 0.06;
const FOLD_SHADE = 0.24;

/**
 * 한 장의 얇은 천. 주름이 앞뒤로 물결치고, 움푹 들어간 골은 어둡게 칠해
 * 평평한 빛에서도 주름이 드러난다. 원점은 바닥 중앙, 벽을 따라 x로 펼쳐진다.
 */
function buildCurtain(): BufferGeometry {
  const geometry = new PlaneGeometry(1, CURTAIN_HEIGHT, CURTAIN_COLUMNS, CURTAIN_ROWS);
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    const u = position.getX(index) + 0.5;
    const y = position.getY(index) + CURTAIN_HEIGHT / 2;
    const fall = Math.max(0, 1 - y / CURTAIN_HEIGHT);
    const width = CURTAIN_TOP_WIDTH + (CURTAIN_HEM_WIDTH - CURTAIN_TOP_WIDTH) * fall;
    // 주름 간격을 조금 불규칙하게 해 기계적인 물결을 피한다.
    const phase = u * PLEATS * Math.PI * 2 + 1.1 * Math.sin(u * 7) + y * 0.16;
    const wave = Math.sin(phase);
    const depth = PLEAT_DEPTH * (0.75 + 0.45 * fall);
    position.setXYZ(index, (u - 0.5) * width, y, wave * depth);
    const shade = 1 - FOLD_SHADE * (0.5 - 0.5 * wave);
    colors.set([shade, shade, shade * 0.98], index * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** 아치 안쪽 가장자리에 늘어지는 시어 커튼과 황동 봉. */
export const curtainParts: AssetPart[] = [
  { material: 'curtain', geometry: mergeStatic([buildCurtain()]), castShadow: false },
  {
    material: 'brass',
    geometry: mergeStatic([
      (() => {
        const rod = cylinder(0.012, 0.012, CURTAIN_TOP_WIDTH + 0.1, [0, 0, 0], 8);
        rod.rotateZ(Math.PI / 2);
        rod.translate(0, CURTAIN_HEIGHT + 0.01, 0);
        return rod;
      })(),
    ]),
    castShadow: false,
  },
];

function discFacingZ(radius: number, thickness: number, z: number) {
  const disc = cylinder(radius, radius, thickness, [0, 0, 0], 40);
  disc.rotateX(Math.PI / 2);
  disc.translate(0, 0, z);
  return disc;
}

/** 오크 틀의 벽 그림. 원점은 벽과 그림 아래 가장자리가 만나는 곳, 앞면이 +z. */
const ART_DEPTH = 0.04;
const ART_FRAME = 0.035;

export const wallArtParts: AssetPart[] = [
  {
    material: 'wallArt',
    geometry: mergeStatic([box(WALL_ART_WIDTH, WALL_ART_HEIGHT, 0.01, [0, WALL_ART_HEIGHT / 2, ART_DEPTH - 0.005])]),
    castShadow: false,
  },
  {
    material: 'oakFrame',
    geometry: mergeStatic([
      box(WALL_ART_WIDTH + ART_FRAME * 2, ART_FRAME, ART_DEPTH + 0.01, [0, -ART_FRAME / 2, ART_DEPTH / 2]),
      box(WALL_ART_WIDTH + ART_FRAME * 2, ART_FRAME, ART_DEPTH + 0.01, [0, WALL_ART_HEIGHT + ART_FRAME / 2, ART_DEPTH / 2]),
      box(ART_FRAME, WALL_ART_HEIGHT, ART_DEPTH + 0.01, [-WALL_ART_WIDTH / 2 - ART_FRAME / 2, WALL_ART_HEIGHT / 2, ART_DEPTH / 2]),
      box(ART_FRAME, WALL_ART_HEIGHT, ART_DEPTH + 0.01, [WALL_ART_WIDTH / 2 + ART_FRAME / 2, WALL_ART_HEIGHT / 2, ART_DEPTH / 2]),
    ]),
  },
];

/** 기둥에 거는 손그림 장식 접시. 원점은 벽에 닿는 면, 앞면이 +z. */
export const bluePlateParts: AssetPart[] = [
  { material: 'paintedPlate', geometry: mergeStatic([discFacingZ(PAINTED_PLATE_RADIUS, 0.025, 0.0125)]), castShadow: false },
];

const FLOOR_VASE_HEIGHT = 0.95;

function buildBranches(): { wood: BufferGeometry; leaves: BufferGeometry } {
  const random = seededRandom(23);
  const tips: Vec3[] = [
    [0.3, 1.85, 0.05],
    [-0.28, 1.75, 0.15],
    [0.05, 2, -0.2],
    [-0.1, 1.7, -0.3],
    [0.2, 1.6, 0.3],
  ];
  const base: Vec3 = [0, FLOOR_VASE_HEIGHT - 0.1, 0];
  return {
    wood: mergeStatic(tips.map((tip) => limb(base, tip, 0.012, 0.004, 5))),
    leaves: mergeStatic(
      tips.flatMap((tip) => {
        const middle: Vec3 = [tip[0] * 0.85, tip[1] - 0.2, tip[2] * 0.85];
        return leafCluster(random, middle, [0.14, 0.3, 0.14], 24, [0.045, 0.006, 0.018]);
      }),
    ),
  };
}

const branches = buildBranches();

/** 큰 화병(decor.floorVase)에 꽂는 올리브 가지. 원점은 바닥. */
export const floorBranchParts: AssetPart[] = [
  { material: 'bark', geometry: branches.wood, castShadow: false },
  { material: 'leaf', geometry: branches.leaves },
];

function buildDriedFlowers(): { stems: BufferGeometry; heads: BufferGeometry } {
  const random = seededRandom(5);
  const stemParts: BufferGeometry[] = [];
  const headParts: BufferGeometry[] = [];
  for (let index = 0; index < 11; index += 1) {
    const angle = random() * Math.PI * 2;
    const lean = 0.03 + random() * 0.13;
    const tip: Vec3 = [Math.cos(angle) * lean, 0.55 + random() * 0.3, Math.sin(angle) * lean];
    stemParts.push(limb([0, 0.2, 0], tip, 0.003, 0.002, 4));
    headParts.push(blob([0.018, 0.04, 0.018], tip, 0));
  }
  return { stems: mergeStatic(stemParts), heads: mergeStatic(headParts) };
}

const dried = buildDriedFlowers();

/** 니치 화병(decor.nicheVase)에 꽂는 드라이플라워. 원점은 니치 밑면. */
export const nicheFlowerParts: AssetPart[] = [
  { material: 'driedStem', geometry: mergeStatic([dried.stems, dried.heads]), castShadow: false },
];
