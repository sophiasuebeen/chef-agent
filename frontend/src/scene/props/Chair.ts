import type { AssetPart } from '../../assets/registry';
import type { Vec3 } from '../../data/layout';
import { BufferAttribute, BufferGeometry } from 'three';
import { box, limb, mergeStatic, roundedBox, tube } from './geometry';

const SEAT_Y = 0.45;
const SHELL_RADIUS_X = 0.29;
const SHELL_RADIUS_Z = 0.27;
const SHELL_THICKNESS = 0.055;
const SHELL_BOTTOM_Y = 0.4;
const ARM_TOP_Y = 0.62;
const BACK_TOP_Y = 0.86;
const SHELL_SWEEP = (118 / 180) * Math.PI;
const SHELL_COLUMNS = 40;

/** 단면: 바깥 아래 → 바깥 위 → 둥근 윗날 → 안쪽 위 → 안쪽 아래. [안쪽으로 든 정도, 높이 비율] */
const SHELL_SECTION: [inset: number, height: number][] = [
  [0, 0],
  [0, 0.5],
  [0, 0.93],
  [0.25, 1],
  [0.75, 1],
  [1, 0.93],
  [1, 0.5],
  [1, 0],
];

/** 뒤에서 앞으로 감싸며 내려오는 통형 등받이. 팔걸이까지 한 덩어리다. */
function barrelShell() {
  const positions: number[] = [];
  const indices: number[] = [];
  const rows = SHELL_SECTION.length;
  for (let column = 0; column <= SHELL_COLUMNS; column += 1) {
    const sweep = -SHELL_SWEEP + (column / SHELL_COLUMNS) * SHELL_SWEEP * 2;
    const toBack = Math.max(0, Math.cos((sweep / SHELL_SWEEP) * (Math.PI / 2)));
    const topY = ARM_TOP_Y + (BACK_TOP_Y - ARM_TOP_Y) * toBack ** 1.5;
    for (const [inset, height] of SHELL_SECTION) {
      const radiusX = SHELL_RADIUS_X - inset * SHELL_THICKNESS;
      const radiusZ = SHELL_RADIUS_Z - inset * SHELL_THICKNESS;
      positions.push(
        Math.sin(sweep) * radiusX,
        SHELL_BOTTOM_Y + (topY - SHELL_BOTTOM_Y) * height,
        -Math.cos(sweep) * radiusZ,
      );
    }
  }
  for (let column = 0; column < SHELL_COLUMNS; column += 1) {
    for (let row = 0; row < rows - 1; row += 1) {
      const a = column * rows + row;
      const b = (column + 1) * rows + row;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const LEG_SPLAY = 0.05;
const LEG_SPOTS: Vec3[] = [
  [-0.2, 0, 0.17],
  [0.2, 0, 0.17],
  [-0.19, 0, -0.17],
  [0.19, 0, -0.17],
];

/** 곡선 등받이의 패브릭 암체어와 월넛 다리. 정면이 +z, 등받이는 -z 쪽이다. */
export const fabricChairParts: AssetPart[] = [
  {
    material: 'fabric',
    geometry: mergeStatic([
      barrelShell(),
      roundedBox(0.5, 0.1, 0.48, 0.045, [0, SEAT_Y, 0.015], 3),
    ]),
  },
  {
    material: 'walnut',
    geometry: mergeStatic(
      LEG_SPOTS.map(([x, , z]) =>
        limb(
          [x, SHELL_BOTTOM_Y + 0.01, z],
          [x * (1 + LEG_SPLAY * 3), 0, z * (1 + LEG_SPLAY * 3)],
          0.022,
          0.012,
          8,
        ),
      ),
    ),
  },
];

const OAK_SEAT_Y = 0.45;
const OAK_TUBE = 0.017;
const ARM_FRONT_X = 0.245;
const ARM_FRONT_Z = 0.21;
const ARM_Y = 0.65;
const OAK_BACK_TOP_Y = 0.86;
const OAK_BACK_BOTTOM_Y = 0.55;
const OAK_BACK_Z = -0.275;
const BACK_SHOULDER_X = 0.235;
const BACK_SHOULDER_Z = -0.19;

/** 말굽 모양 윗 프레임: 한쪽 팔걸이에서 등받이 위를 지나 반대쪽 팔걸이로 이어진다. */
const TOP_RAIL: Vec3[] = [
  [-ARM_FRONT_X, ARM_Y - 0.01, ARM_FRONT_Z],
  [-ARM_FRONT_X - 0.015, ARM_Y + 0.005, 0.03],
  [-BACK_SHOULDER_X, ARM_Y + 0.11, BACK_SHOULDER_Z],
  [-0.13, OAK_BACK_TOP_Y - 0.015, OAK_BACK_Z + 0.02],
  [0, OAK_BACK_TOP_Y, OAK_BACK_Z],
  [0.13, OAK_BACK_TOP_Y - 0.015, OAK_BACK_Z + 0.02],
  [BACK_SHOULDER_X, ARM_Y + 0.11, BACK_SHOULDER_Z],
  [ARM_FRONT_X + 0.015, ARM_Y + 0.005, 0.03],
  [ARM_FRONT_X, ARM_Y - 0.01, ARM_FRONT_Z],
];

const SEAT_RAIL_Y = OAK_SEAT_Y - 0.065;

function oakFrame() {
  const parts: BufferGeometry[] = [tube(TOP_RAIL, OAK_TUBE, 64)];
  // 등받이 아래 살과 다리
  parts.push(
    tube(
      [
        [-BACK_SHOULDER_X + 0.005, OAK_BACK_BOTTOM_Y + 0.01, BACK_SHOULDER_Z],
        [-0.12, OAK_BACK_BOTTOM_Y, OAK_BACK_Z + 0.025],
        [0, OAK_BACK_BOTTOM_Y - 0.005, OAK_BACK_Z + 0.005],
        [0.12, OAK_BACK_BOTTOM_Y, OAK_BACK_Z + 0.025],
        [BACK_SHOULDER_X - 0.005, OAK_BACK_BOTTOM_Y + 0.01, BACK_SHOULDER_Z],
      ],
      OAK_TUBE * 0.8,
      28,
    ),
  );
  for (const side of [-1, 1]) {
    // 뒷다리는 바닥에서 뒤로 벌어졌다가 등받이 어깨까지 올라간다.
    parts.push(
      tube(
        [
          [side * 0.225, 0, -0.285],
          [side * 0.225, SEAT_RAIL_Y, BACK_SHOULDER_Z - 0.01],
          [side * BACK_SHOULDER_X, ARM_Y + 0.11, BACK_SHOULDER_Z],
        ],
        OAK_TUBE,
        16,
      ),
      // 앞다리는 팔걸이 끝을 받친다.
      tube(
        [
          [side * 0.235, 0, ARM_FRONT_Z + 0.015],
          [side * 0.238, SEAT_RAIL_Y, ARM_FRONT_Z],
          [side * ARM_FRONT_X, ARM_Y - 0.01, ARM_FRONT_Z],
        ],
        OAK_TUBE,
        14,
      ),
      // 옆 좌석 틀
      box(0.03, 0.035, ARM_FRONT_Z - BACK_SHOULDER_Z, [
        side * 0.232,
        SEAT_RAIL_Y,
        (ARM_FRONT_Z + BACK_SHOULDER_Z) / 2,
      ]),
    );
  }
  parts.push(
    box(0.46, 0.035, 0.03, [0, SEAT_RAIL_Y, ARM_FRONT_Z]),
    box(0.46, 0.035, 0.03, [0, SEAT_RAIL_Y, BACK_SHOULDER_Z]),
  );
  return mergeStatic(parts);
}

const CANE_COLUMNS = 24;
const CANE_ROWS = 6;

/** 등받이의 오목한 곡면을 따라 위 살과 아래 살 사이를 채우는 라탄 망. */
function canePanel() {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= CANE_ROWS; row += 1) {
    const rise = row / CANE_ROWS;
    for (let column = 0; column <= CANE_COLUMNS; column += 1) {
      const across = (column / CANE_COLUMNS) * 2 - 1;
      const bow = 1 - across * across;
      const topY = ARM_Y + 0.11 + (OAK_BACK_TOP_Y - ARM_Y - 0.11) * bow ** 0.6;
      const y = OAK_BACK_BOTTOM_Y + (topY - OAK_BACK_BOTTOM_Y) * rise;
      positions.push(across * BACK_SHOULDER_X, y, BACK_SHOULDER_Z + (OAK_BACK_Z - BACK_SHOULDER_Z) * bow);
    }
  }
  const stride = CANE_COLUMNS + 1;
  for (let row = 0; row < CANE_ROWS; row += 1) {
    for (let column = 0; column < CANE_COLUMNS; column += 1) {
      const a = row * stride + column;
      indices.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return mergeStatic([geometry]);
}

/** 테라스의 곡선 프레임 오크 의자. 등받이는 라탄 망, 정면이 +z. */
export const oakChairParts: AssetPart[] = [
  { material: 'oakFrame', geometry: oakFrame() },
  { material: 'cane', geometry: canePanel(), castShadow: false },
  {
    material: 'fabric',
    geometry: mergeStatic([roundedBox(0.47, 0.085, 0.45, 0.034, [0, OAK_SEAT_Y, 0.012], 3)]),
  },
];

/** 소파 좌석은 판정 상자만 있다. 보이는 천은 decor.banquetteSegment가 맡는다. */
export const banquetteSeatParts: AssetPart[] = [];
