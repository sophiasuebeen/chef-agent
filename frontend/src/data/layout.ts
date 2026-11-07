/**
 * 장면 배치의 유일한 데이터 원본. 컴포넌트는 이 값을 읽어 배치만 한다.
 *
 * 좌표: 1 unit = 1m, Y-up. 원점은 패스 카운터 앞쪽 모서리의 바닥 중앙.
 *       주방 z < 0 → 다이닝 홀 z > 0 → 테라스 → 바다(+z).
 *       평면도를 위에서 본 방향과 같다: 오른쪽 = +x, 위쪽 = -z.
 * 회전: rotationY = 0 이면 물건의 정면이 +z를 향한다.
 * position: 별도 표기가 없으면 물건 바닥면의 중심.
 */

export type Vec3 = [x: number, y: number, z: number];

export type StationType = 'pantry' | 'prep' | 'boil' | 'sauce' | 'plating' | 'pass' | 'dish';

export interface Station {
  id: string;
  type: StationType;
  /** 평면도의 원 번호 (①~⑦). */
  planNumber: number;
  position: Vec3;
  /** 폭(x), 높이(y), 깊이(z). */
  size: Vec3;
  chefSpot: Vec3;
}

export type SeatType = 'chair' | 'banquette';

export interface Seat {
  id: string;
  position: Vec3;
  rotationY: number;
  type: SeatType;
}

export type TableZone = 'hall' | 'terrace';
export type TableShape = 'square' | 'round' | 'terraceSlab';

export interface DiningTable {
  id: string;
  zone: TableZone;
  shape: TableShape;
  position: Vec3;
  rotationY: number;
  seats: Seat[];
}

export interface Waypoint {
  id: string;
  position: Vec3;
  links: string[];
}

export type AnchorKind = 'pickupZone' | 'entrance' | 'cameraTarget';

export interface Anchor {
  id: string;
  kind: AnchorKind;
  position: Vec3;
  /** 영역을 가진 앵커의 폭(x), 높이(y), 깊이(z). */
  size?: Vec3;
}

export interface PassRail {
  id: string;
  position: Vec3;
  size: Vec3;
}

export interface PlateSlot {
  id: string;
  /** 이 자리가 속한 스테이션 또는 좌석의 id. */
  ownerId: string;
  /** 접시가 놓이는 면의 중심. */
  position: Vec3;
}

/** 상호작용하지 않는 소품 하나의 배치. assetId는 assets/registry.ts의 키. */
export interface DecorPlacement {
  id: string;
  assetId: string;
  position: Vec3;
  rotationY: number;
}

// ---------------------------------------------------------------------------
// 건축 치수
// ---------------------------------------------------------------------------

/** 주방 치수는 평면도 그대로 (스테이션 폭 1.6m, 통로 1.2m, 카운터 높이 0.94m). */
export const KITCHEN = {
  stationWidth: 1.6,
  aisleWidth: 1.2,
  counterHeight: 0.94,
  frontCounterDepth: 0.7,
  backCounterDepth: 0.8,
  /** 벽 안쪽 면 기준 x 범위 절반. */
  halfWidth: 3.3,
  /** 홀 카메라(높이 4.7m)에서 뒷벽이 보이도록 패스 위 개구부를 높게 둔다. */
  ceilingHeight: 3.6,
  wallThickness: 0.2,
} as const;

const FRONT_ROW_Z = -KITCHEN.frontCounterDepth / 2;
const AISLE_CENTER_Z = -(KITCHEN.frontCounterDepth + KITCHEN.aisleWidth / 2);
const BACK_ROW_Z = -(KITCHEN.frontCounterDepth + KITCHEN.aisleWidth + KITCHEN.backCounterDepth / 2);
const BACK_WALL_Z = -(KITCHEN.frontCounterDepth + KITCHEN.aisleWidth + KITCHEN.backCounterDepth);

/** 서쪽 출입구의 z. 줄 사이 가로 통로와 맞춘다. */
const ENTRANCE_Z = 4.7;

export const ARCHITECTURE = {
  kitchen: { minX: -KITCHEN.halfWidth, maxX: KITCHEN.halfWidth, minZ: BACK_WALL_Z, maxZ: 0 },
  hall: {
    minX: -8,
    maxX: 8,
    minZ: 0,
    maxZ: 12,
    height: 5.4,
    wallThickness: 0.3,
    /** 주방 쪽 벽은 z < 0 쪽으로 두께를 가져 패스 앞 모서리가 z = 0에 남는다. */
    kitchenWallThickness: 0.2,
    roofThickness: 0.3,
    /** 서쪽 벽의 출입구. entrance 앵커와 같은 z. */
    entrance: { z: ENTRANCE_Z, width: 1.4, height: 2.6 },
    /** 동쪽 벽에 파 넣은 아치형 니치. bottom은 바닥에서 니치 밑면까지의 높이. */
    eastNiches: { centersZ: [2.8, 6.4, 10], width: 0.8, bottom: 1, height: 1.5, depth: 0.2 },
  },
  /** 바다 쪽 벽의 아치 4개. centersX는 각 베이의 중심. */
  seaWall: {
    thickness: 0.6,
    arch: {
      centersX: [-6, -2, 2, 6],
      width: 2.8,
      height: 3.8,
      /** 가운데는 문이 열린 통로다. 웨이터 경로가 이 폭 안을 지난다. */
      doorWidth: 1.3,
      frameWidth: 0.05,
      frameDepth: 0.07,
    },
    /** 벽 모서리를 굴려 손으로 바른 회벽처럼 보이게 하는 반지름. */
    edgeRadius: 0.07,
  },
  /**
   * 박공 유리 지붕. 용마루는 x 방향이고, 타이 빔은 mullionSpacing 격자의 홀수 줄마다 z 방향으로
   * 놓여 펜던트를 매단다. 서까래는 타이 빔 위에서 용마루로 올라간다.
   */
  skylight: {
    centerX: 0,
    centerZ: 6.4,
    width: 12,
    depth: 7.5,
    ridgeRise: 1.3,
    mullionSpacing: 1.2,
    tieWidth: 0.12,
    tieDepth: 0.22,
    rafterWidth: 0.09,
    rafterDepth: 0.14,
    ridgeWidth: 0.16,
    purlinSpacing: 0.95,
    purlinWidth: 0.045,
    purlinDepth: 0.06,
    /** 천창 둘레와 벽 위쪽을 잇는 곡면 회벽의 반지름. */
    wellRadius: 0.3,
    wallCoveRadius: 0.4,
  },
  terrace: {
    minX: -10,
    maxX: 10,
    minZ: 12.6,
    maxZ: 19,
    railingHeight: 0.9,
    railingThickness: 0.15,
    /** 난간에 붙은 붙박이 소파. */
    banquette: {
      depth: 0.75,
      seatHeight: 0.45,
      plinthHeight: 0.28,
      backThickness: 0.17,
      segmentLength: 1.2,
      segmentCount: 16,
    },
  },
  /** 테라스 바닥(y=0) 아래의 해수면과 건물이 놓인 땅. */
  sea: { level: -3 },
  /**
   * 건물이 놓인 곶. 해안선은 테라스 앞에서 평평하고 양옆으로 물러난다.
   * 계단식 세 층(땅 → 수풀 턱 → 모래사장)은 해안선을 바다 쪽으로 zOffset만큼 민 것이다.
   */
  land: {
    halfWidth: 1500,
    backZ: -1500,
    frontZ: 19.4,
    flatHalfWidth: 11.5,
    recede: 70,
    recedeScale: 25,
    layers: {
      ground: { topY: -0.03, zOffset: 0 },
      shrubShelf: { topY: -1.1, zOffset: 2 },
      beach: { topY: -2.75, zOffset: 7 },
    },
  },
  /** 그림자 범위의 중심. 태양 방향은 data/timeOfDay.ts에 있다. */
  sun: { target: [0, 0, 8] as Vec3 },
} as const;

// ---------------------------------------------------------------------------
// 주방 스테이션 (평면도 ①~⑦)
// ---------------------------------------------------------------------------

function station(
  id: string,
  type: StationType,
  planNumber: number,
  x: number,
  z: number,
  width: number,
  depth: number,
): Station {
  return {
    id,
    type,
    planNumber,
    position: [x, 0, z],
    size: [width, KITCHEN.counterHeight, depth],
    chefSpot: [x, 0, AISLE_CENTER_Z],
  };
}

const { stationWidth: SW, frontCounterDepth: FD, backCounterDepth: BD } = KITCHEN;

export const stations: Station[] = [
  station('station.pantry', 'pantry', 1, -1.5 * SW, BACK_ROW_Z, SW, BD),
  station('station.prep', 'prep', 2, -0.5 * SW, BACK_ROW_Z, SW, BD),
  station('station.boil', 'boil', 3, 0.5 * SW, BACK_ROW_Z, SW, BD),
  station('station.sauce', 'sauce', 4, 1.5 * SW, BACK_ROW_Z, SW, BD),
  station('station.plating', 'plating', 5, 1.5 * SW, FRONT_ROW_Z, SW, FD),
  station('station.pass', 'pass', 6, 0, FRONT_ROW_Z, 2 * SW, FD),
  station('station.dish', 'dish', 7, -1.5 * SW, FRONT_ROW_Z, SW, FD),
];

/** 패스 위 주문 레일. position은 레일 바닥면의 중심. */
export const passRail: PassRail = {
  id: 'rail.pass',
  position: [0, KITCHEN.counterHeight, -0.24],
  size: [3, 0.06, 0.06],
};

// ---------------------------------------------------------------------------
// 테이블과 좌석
// ---------------------------------------------------------------------------

export const TABLE_DIMENSIONS = {
  square: { width: 0.9, depth: 0.9, height: 0.75 },
  round: { width: 1, depth: 1, height: 0.75 },
  terraceSlab: { width: 1.3, depth: 0.8, height: 0.75 },
} as const;

interface SeatOffset {
  key: string;
  x: number;
  z: number;
  type: SeatType;
}

const FOUR_AROUND: SeatOffset[] = [
  { key: 'a', x: 0, z: -0.75, type: 'chair' },
  { key: 'b', x: 0.75, z: 0, type: 'chair' },
  { key: 'c', x: 0, z: 0.75, type: 'chair' },
  { key: 'd', x: -0.75, z: 0, type: 'chair' },
];

/** 테라스 슬래브: 바다 쪽은 붙박이 소파, 홀 쪽은 의자 2개. */
const SLAB_SIDES: SeatOffset[] = [
  { key: 'a', x: -0.35, z: -0.85, type: 'chair' },
  { key: 'b', x: 0.35, z: -0.85, type: 'chair' },
  { key: 'c', x: -0.35, z: 0.75, type: 'banquette' },
  { key: 'd', x: 0.35, z: 0.75, type: 'banquette' },
];

function rotateY(x: number, z: number, angle: number): [number, number] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [x * cos + z * sin, -x * sin + z * cos];
}

/** 좌석 위치와 방향이 테이블 위치에서 파생되므로, 테이블만 옮기면 좌석도 따라온다. */
function table(
  zone: TableZone,
  number: number,
  shape: TableShape,
  x: number,
  z: number,
  rotationY = 0,
): DiningTable {
  const offsets = shape === 'terraceSlab' ? SLAB_SIDES : FOUR_AROUND;
  return {
    id: `table.${zone}.${number}`,
    zone,
    shape,
    position: [x, 0, z],
    rotationY,
    seats: offsets.map((offset) => {
      const [dx, dz] = rotateY(offset.x, offset.z, rotationY);
      // 슬래브 좌석은 옆 사람과 나란히 앉으므로 x 오프셋을 무시하고 테이블 면을 수직으로 바라본다.
      const [faceX, faceZ] = rotateY(shape === 'terraceSlab' ? 0 : -offset.x, -offset.z, rotationY);
      return {
        id: `seat.${zone}.${number}.${offset.key}`,
        position: [x + dx, 0, z + dz],
        rotationY: Math.atan2(faceX, faceZ),
        type: offset.type,
      };
    }),
  };
}

const TERRACE_TABLE_Z = 17.6;

export const tables: DiningTable[] = [
  table('hall', 1, 'square', -5.6, 3),
  table('hall', 2, 'square', -2.15, 2.85),
  table('hall', 3, 'square', 2.55, 3.15),
  table('hall', 4, 'square', 5.75, 2.8),
  table('hall', 5, 'round', -5.6, 6.4),
  table('hall', 6, 'round', 5.6, 6.4),
  table('hall', 7, 'square', -5.45, 9.45),
  table('hall', 8, 'square', -2.2, 9.8),
  table('hall', 9, 'square', 2.65, 9.4),
  table('hall', 10, 'square', 5.6, 9.6),
  table('terrace', 1, 'terraceSlab', -8, TERRACE_TABLE_Z),
  table('terrace', 2, 'terraceSlab', -4.8, TERRACE_TABLE_Z),
  table('terrace', 3, 'terraceSlab', -1.6, TERRACE_TABLE_Z),
  table('terrace', 4, 'terraceSlab', 1.6, TERRACE_TABLE_Z),
  table('terrace', 5, 'terraceSlab', 4.8, TERRACE_TABLE_Z),
  table('terrace', 6, 'terraceSlab', 8, TERRACE_TABLE_Z),
];

// ---------------------------------------------------------------------------
// 접시 자리
// ---------------------------------------------------------------------------

const PASS_PLATE_XS = [-0.96, -0.32, 0.32, 0.96];
const PLATING_PLATE_XS = [2, 2.5];
/** 평면도에서 접시 줄의 z (패스·플레이팅 공통). */
const COUNTER_PLATE_Z = -0.42;

/** 접시는 테이블 가장자리 쪽으로 이 비율만큼 나간 곳에 놓인다. */
const SEAT_PLATE_RATIO = 0.42;
/** 슬래브는 폭이 좁아 비율 대신 좌석 x를 그대로 쓰고 깊이만 고정한다. */
const SLAB_PLATE_DEPTH = 0.26;

/** 좌석을 테이블 회전 전의 로컬 오프셋으로 되돌린다. */
function seatLocalOffset(diningTable: DiningTable, seat: Seat): [x: number, z: number] {
  return rotateY(
    seat.position[0] - diningTable.position[0],
    seat.position[2] - diningTable.position[2],
    -diningTable.rotationY,
  );
}

function plateSlotPosition(diningTable: DiningTable, seat: Seat): Vec3 {
  const [localX, localZ] = seatLocalOffset(diningTable, seat);
  const [plateX, plateZ] =
    diningTable.shape === 'terraceSlab'
      ? [localX, Math.sign(localZ) * SLAB_PLATE_DEPTH]
      : [localX * SEAT_PLATE_RATIO, localZ * SEAT_PLATE_RATIO];
  const [worldX, worldZ] = rotateY(plateX, plateZ, diningTable.rotationY);
  return [
    diningTable.position[0] + worldX,
    TABLE_DIMENSIONS[diningTable.shape].height,
    diningTable.position[2] + worldZ,
  ];
}

export const plateSlots: PlateSlot[] = [
  ...PASS_PLATE_XS.map((x, index) => ({
    id: `plate.pass.${index + 1}`,
    ownerId: 'station.pass',
    position: [x, KITCHEN.counterHeight, COUNTER_PLATE_Z] satisfies Vec3,
  })),
  ...PLATING_PLATE_XS.map((x, index) => ({
    id: `plate.plating.${index + 1}`,
    ownerId: 'station.plating',
    position: [x, KITCHEN.counterHeight, COUNTER_PLATE_Z] satisfies Vec3,
  })),
  ...tables.flatMap((diningTable) =>
    diningTable.seats.map((seat) => ({
      id: seat.id.replace(/^seat\./, 'plate.'),
      ownerId: seat.id,
      position: plateSlotPosition(diningTable, seat),
    })),
  ),
];

// ---------------------------------------------------------------------------
// 앵커
// ---------------------------------------------------------------------------

export const anchors: Anchor[] = [
  { id: 'anchor.pickupZone', kind: 'pickupZone', position: [0, 0, 0.42], size: [3.2, 0, 0.84] },
  { id: 'anchor.entrance', kind: 'entrance', position: [-8, 0, ENTRANCE_Z] },
  { id: 'camTarget.overview', kind: 'cameraTarget', position: [1, 0, 9] },
  { id: 'camTarget.dining', kind: 'cameraTarget', position: [-3.6, 2.75, 12] },
  { id: 'camTarget.terrace', kind: 'cameraTarget', position: [3.5, 0.75, 20.5] },
  { id: 'camTarget.kitchen', kind: 'cameraTarget', position: [0, 0.9, -1.3] },
];

// ---------------------------------------------------------------------------
// 웨이터 이동 그래프 (간선만 적으면 양방향 links가 파생된다)
// ---------------------------------------------------------------------------

/** 홀의 가로 통로 z. 각 값은 테이블 줄 사이의 빈 공간이다. */
// Keep the wall aisle in front of the floor vases between the terrace doors.
const CROSS_Z = { front: 1.4, mid: 4.7, back: 8, wall: 11.1 } as const;
const TERRACE_AISLE_Z = 15.9;

const waypointPositions: Record<string, [x: number, z: number]> = {
  'wp.pickup': [1.2, 0.54],
  'wp.entrance': [-7.6, CROSS_Z.mid],

  'wp.front.w': [-4, CROSS_Z.front],
  'wp.front.c': [1.2, CROSS_Z.front],
  'wp.front.e': [4, CROSS_Z.front],
  'wp.mid.w': [-4, CROSS_Z.mid],
  'wp.mid.c': [1.2, CROSS_Z.mid],
  'wp.mid.e': [4, CROSS_Z.mid],
  'wp.back.w': [-4, CROSS_Z.back],
  'wp.back.c': [1.2, CROSS_Z.back],
  'wp.back.e': [4, CROSS_Z.back],
  'wp.wall.w': [-4, CROSS_Z.wall],
  'wp.wall.e': [4, CROSS_Z.wall],

  'wp.arch.1': [-6, CROSS_Z.wall],
  'wp.arch.2': [-2, CROSS_Z.wall],
  'wp.arch.3': [2, CROSS_Z.wall],
  'wp.arch.4': [6, CROSS_Z.wall],
  'wp.terrace.1': [-6, TERRACE_AISLE_Z],
  'wp.terrace.2': [-2, TERRACE_AISLE_Z],
  'wp.terrace.3': [2, TERRACE_AISLE_Z],
  'wp.terrace.4': [6, TERRACE_AISLE_Z],

  'wp.table.hall.1': [-5.6, CROSS_Z.front],
  'wp.table.hall.2': [-2.4, CROSS_Z.front],
  'wp.table.hall.3': [2.4, CROSS_Z.front],
  'wp.table.hall.4': [5.6, CROSS_Z.front],
  'wp.table.hall.5': [-4, 6.4],
  'wp.table.hall.6': [4, 6.4],
  'wp.table.hall.7': [-5.6, CROSS_Z.back],
  'wp.table.hall.8': [-2.4, CROSS_Z.back],
  'wp.table.hall.9': [2.4, CROSS_Z.back],
  'wp.table.hall.10': [5.6, CROSS_Z.back],
  'wp.table.terrace.1': [-8, TERRACE_AISLE_Z],
  'wp.table.terrace.2': [-4.8, TERRACE_AISLE_Z],
  'wp.table.terrace.3': [-1.6, TERRACE_AISLE_Z],
  'wp.table.terrace.4': [1.6, TERRACE_AISLE_Z],
  'wp.table.terrace.5': [4.8, TERRACE_AISLE_Z],
  'wp.table.terrace.6': [8, TERRACE_AISLE_Z],
};

const waypointEdges: [string, string][] = [
  // 픽업 존 → 홀 (평면도의 초록 점선, x = 1.2)
  ['wp.pickup', 'wp.front.c'],
  ['wp.front.c', 'wp.mid.c'],
  ['wp.entrance', 'wp.mid.w'],

  // 앞쪽 가로 통로와 1줄 테이블
  ['wp.table.hall.1', 'wp.front.w'],
  ['wp.front.w', 'wp.table.hall.2'],
  ['wp.table.hall.2', 'wp.front.c'],
  ['wp.front.c', 'wp.table.hall.3'],
  ['wp.table.hall.3', 'wp.front.e'],
  ['wp.front.e', 'wp.table.hall.4'],

  // 중간 가로 통로 (나무 앞을 지난다)
  ['wp.mid.w', 'wp.mid.c'],
  ['wp.mid.c', 'wp.mid.e'],

  // 뒤쪽 가로 통로와 3줄 테이블 (나무 뒤를 지난다)
  ['wp.table.hall.7', 'wp.back.w'],
  ['wp.back.w', 'wp.table.hall.8'],
  ['wp.table.hall.8', 'wp.back.c'],
  ['wp.back.c', 'wp.table.hall.9'],
  ['wp.table.hall.9', 'wp.back.e'],
  ['wp.back.e', 'wp.table.hall.10'],

  // 세로 통로 x = ±4
  ['wp.front.w', 'wp.mid.w'],
  ['wp.mid.w', 'wp.table.hall.5'],
  ['wp.table.hall.5', 'wp.back.w'],
  ['wp.back.w', 'wp.wall.w'],
  ['wp.front.e', 'wp.mid.e'],
  ['wp.mid.e', 'wp.table.hall.6'],
  ['wp.table.hall.6', 'wp.back.e'],
  ['wp.back.e', 'wp.wall.e'],

  // 아치 앞 통로
  ['wp.arch.1', 'wp.wall.w'],
  ['wp.wall.w', 'wp.arch.2'],
  ['wp.arch.2', 'wp.arch.3'],
  ['wp.arch.3', 'wp.wall.e'],
  ['wp.wall.e', 'wp.arch.4'],

  // 아치를 지나 테라스로
  ['wp.arch.1', 'wp.terrace.1'],
  ['wp.arch.2', 'wp.terrace.2'],
  ['wp.arch.3', 'wp.terrace.3'],
  ['wp.arch.4', 'wp.terrace.4'],

  // 테라스 통로
  ['wp.table.terrace.1', 'wp.terrace.1'],
  ['wp.terrace.1', 'wp.table.terrace.2'],
  ['wp.table.terrace.2', 'wp.terrace.2'],
  ['wp.terrace.2', 'wp.table.terrace.3'],
  ['wp.table.terrace.3', 'wp.table.terrace.4'],
  ['wp.table.terrace.4', 'wp.terrace.3'],
  ['wp.terrace.3', 'wp.table.terrace.5'],
  ['wp.table.terrace.5', 'wp.terrace.4'],
  ['wp.terrace.4', 'wp.table.terrace.6'],
];

export const waypoints: Waypoint[] = Object.entries(waypointPositions).map(([id, [x, z]]) => ({
  id,
  position: [x, 0, z],
  links: waypointEdges.flatMap(([from, to]) => (from === id ? [to] : to === id ? [from] : [])),
}));

// ---------------------------------------------------------------------------
// 테이블 세팅 (좌석 기준 배치에서 파생되므로 테이블을 옮기면 함께 움직인다)
// ---------------------------------------------------------------------------

/** 좌석에 앉은 사람 기준 오프셋. lateral은 오른쪽(+), depth는 테이블 중심에서 좌석 쪽(+). */
const PLACE_SETTING = [
  { assetId: 'setting.napkin', lateral: -0.2, depth: 0.33 },
  { assetId: 'setting.wineGlass', lateral: 0.19, depth: 0.2 },
] as const;

/** 테이블 중심 기준의 공용 소품. 접시 안쪽 테두리(반지름 약 0.19m) 안에 들어간다. */
const TABLE_CENTER_SETTING = [
  { assetId: 'setting.lemonVase', x: 0, z: 0.01 },
  { assetId: 'setting.breadBasket', x: -0.095, z: -0.09 },
  { assetId: 'setting.candle', x: 0.105, z: -0.085 },
  { assetId: 'setting.oilBottle', x: 0.095, z: 0.1 },
] as const;

/** 처음부터 파스타가 올라가 있는 좌석. 게임 로직이 붙기 전의 장식 데이터다. */
const SEATS_WITH_PASTA = new Set([
  'seat.terrace.2.a',
  'seat.terrace.5.c',
  'seat.hall.1.a',
  'seat.hall.1.c',
  'seat.hall.3.b',
  'seat.hall.5.a',
  'seat.hall.8.c',
  'seat.hall.8.d',
  'seat.hall.10.b',
]);

function placeSettingPlacements(diningTable: DiningTable): DecorPlacement[] {
  const [centerX, , centerZ] = diningTable.position;
  const surfaceY = TABLE_DIMENSIONS[diningTable.shape].height;
  return diningTable.seats.flatMap((seat) => {
    const towardCenterX = Math.sin(seat.rotationY);
    const towardCenterZ = Math.cos(seat.rotationY);
    const rightX = -towardCenterZ;
    const rightZ = towardCenterX;
    return PLACE_SETTING.map(({ assetId, depth, lateral }) => ({
      id: `${seat.id}.${assetId}`,
      assetId,
      position: [
        centerX - towardCenterX * depth + rightX * lateral,
        surfaceY,
        centerZ - towardCenterZ * depth + rightZ * lateral,
      ] satisfies Vec3,
      rotationY: seat.rotationY,
    }));
  });
}

function centerSettingPlacements(diningTable: DiningTable): DecorPlacement[] {
  const [centerX, , centerZ] = diningTable.position;
  const surfaceY = TABLE_DIMENSIONS[diningTable.shape].height;
  return TABLE_CENTER_SETTING.map(({ assetId, x, z }) => {
    const [dx, dz] = rotateY(x, z, diningTable.rotationY);
    return {
      id: `${diningTable.id}.${assetId}`,
      assetId,
      position: [centerX + dx, surfaceY, centerZ + dz] satisfies Vec3,
      rotationY: diningTable.rotationY,
    };
  });
}

const hallTables = tables.filter((diningTable) => diningTable.zone === 'hall');

export const hallTableSettings: DecorPlacement[] = hallTables.flatMap((diningTable) => [
  ...placeSettingPlacements(diningTable),
  ...centerSettingPlacements(diningTable),
]);

/** 테라스 슬래브의 공용 소품. 접시 사이의 좁은 띠에 일렬로 놓인다. */
const TERRACE_CENTER_SETTING = [
  { assetId: 'setting.flowerVase', x: -0.2, z: 0 },
  { assetId: 'setting.candle', x: 0.05, z: 0 },
  { assetId: 'setting.iceBucket', x: 0.5, z: 0 },
] as const;
const SLAB_GLASS_DEPTH = 0.1;

const terraceTables = tables.filter((diningTable) => diningTable.zone === 'terrace');

export const terraceTableSettings: DecorPlacement[] = terraceTables.flatMap((diningTable) => {
  const [centerX, , centerZ] = diningTable.position;
  const surfaceY = TABLE_DIMENSIONS[diningTable.shape].height;
  const toWorld = (assetId: string, id: string, x: number, z: number, rotation: number) => {
    const [dx, dz] = rotateY(x, z, diningTable.rotationY);
    return {
      id,
      assetId,
      position: [centerX + dx, surfaceY, centerZ + dz] satisfies Vec3,
      rotationY: rotation,
    };
  };
  return [
    ...diningTable.seats.map((seat) => {
      const [localX, localZ] = seatLocalOffset(diningTable, seat);
      return toWorld(
        'setting.wineGlass',
        `${seat.id}.setting.wineGlass`,
        localX,
        Math.sign(localZ) * SLAB_GLASS_DEPTH,
        seat.rotationY,
      );
    }),
    ...TERRACE_CENTER_SETTING.map(({ assetId, x, z }) =>
      toWorld(assetId, `${diningTable.id}.${assetId}`, x, z, diningTable.rotationY),
    ),
  ];
});

/** 접시 자리마다 놓이는 빈 접시와, 일부 좌석의 파스타. */
export const plates: DecorPlacement[] = plateSlots.flatMap((slot) => {
  const plate: DecorPlacement = {
    id: `${slot.id}.plate`,
    assetId: 'plate.dinner',
    position: slot.position,
    rotationY: 0,
  };
  if (!SEATS_WITH_PASTA.has(slot.ownerId)) return [plate];
  return [plate, { id: `${slot.id}.pasta`, assetId: 'food.pasta', position: slot.position, rotationY: 0 }];
});

// ---------------------------------------------------------------------------
// 홀의 고정 소품
// ---------------------------------------------------------------------------

const { eastNiches, height: HALL_HEIGHT, roofThickness: ROOF_THICKNESS, maxX: HALL_MAX_X, maxZ: HALL_MAX_Z } =
  ARCHITECTURE.hall;
const { skylight: SKYLIGHT, seaWall: SEA_WALL } = ARCHITECTURE;

/** 펜던트는 타이 빔에 매단다. x 격자의 홀수 줄이 타이 빔 위치다. */
const MULLION_BOTTOM_Y = HALL_HEIGHT + ROOF_THICKNESS - SKYLIGHT.tieDepth;
const mullionLineX = (index: number) => SKYLIGHT.centerX - SKYLIGHT.width / 2 + index * SKYLIGHT.mullionSpacing;
const mullionLineZ = (index: number) => SKYLIGHT.centerZ - SKYLIGHT.depth / 2 + index * SKYLIGHT.mullionSpacing;

/** 펜던트는 적게, 낮게. 조명이 공간을 채우기보다 테이블 몇 곳에 시선을 모은다. */
const PENDANT_GRID: [xLine: number, zLine: number][] = [
  [1, 3],
  [9, 3],
  [3, 5],
];

const STANDING_LAMP_SPOTS: [x: number, z: number][] = [
  [7.4, 11.3],
];

/** 서쪽 벽의 붙박이 벤치와 그 위의 그림. 빈 벽에 무게를 준다. */
const { minX: WEST_WALL_X } = ARCHITECTURE.hall;
const { banquette: BENCH_SEGMENT } = ARCHITECTURE.terrace;
export const WEST_BENCH = {
  startZ: 6.3,
  segments: 4,
  depth: BENCH_SEGMENT.depth,
  plinthHeight: BENCH_SEGMENT.plinthHeight,
};
const BENCH_END_Z = WEST_BENCH.startZ + WEST_BENCH.segments * BENCH_SEGMENT.segmentLength;
const WALL_ART_BOTTOM = 1.05;

const { centersX: ARCH_CENTERS, width: ARCH_WIDTH } = SEA_WALL.arch;
/** 아치 사이 기둥의 중심 x. */
const PIER_CENTERS = ARCH_CENTERS.slice(0, -1).map(
  (centerX, index) => (centerX + (ARCH_CENTERS[index + 1] ?? centerX)) / 2,
);
/** 커튼 중심이 아치 가장자리에서 안쪽으로 든 거리. 가운데 문과 기둥 장식을 가리지 않는다. */
const CURTAIN_INSET = 0.24;
const { eastNiches: EAST_NICHES, maxX: EAST_WALL_X } = ARCHITECTURE.hall;
const CURTAIN_WALL_OFFSET = 0.07;
const WALL_PLATE_HEIGHT = 3;
const FLOOR_VASE_WALL_OFFSET = 0.28;

export const decor: DecorPlacement[] = [
  { id: 'decor.oliveTree', assetId: 'tree.olive', position: [0, 0, 6.4], rotationY: 0 },

  ...PENDANT_GRID.map(([xLine, zLine], index) => ({
    id: `decor.pendant.${index + 1}`,
    assetId: 'lamp.pendant',
    position: [mullionLineX(xLine), MULLION_BOTTOM_Y, mullionLineZ(zLine)] satisfies Vec3,
    rotationY: 0,
  })),

  ...STANDING_LAMP_SPOTS.map(([x, z], index) => ({
    id: `decor.standingLamp.${index + 1}`,
    assetId: 'lamp.standing',
    position: [x, 0, z] satisfies Vec3,
    rotationY: 0,
  })),

  ...ARCH_CENTERS.flatMap((centerX, index) =>
    [-1, 1].map((side) => ({
      id: `decor.curtain.${index + 1}.${side < 0 ? 'w' : 'e'}`,
      assetId: 'decor.curtain',
      position: [
        centerX + side * (ARCH_WIDTH / 2 - CURTAIN_INSET),
        0,
        HALL_MAX_Z - CURTAIN_WALL_OFFSET,
      ] satisfies Vec3,
      rotationY: 0,
    })),
  ),

  ...PIER_CENTERS.map((x, index) => ({
    id: `decor.wallPlate.${index + 1}`,
    assetId: 'decor.bluePlate',
    position: [x, WALL_PLATE_HEIGHT, HALL_MAX_Z] satisfies Vec3,
    rotationY: Math.PI,
  })),

  // 바깥쪽 두 기둥 앞의 큰 화병
  ...[PIER_CENTERS[0], PIER_CENTERS[PIER_CENTERS.length - 1]].flatMap((x, index) =>
    (['decor.floorVase', 'decor.floorBranches'] as const).map((assetId) => ({
      id: `${assetId}.${index + 1}`,
      assetId,
      position: [x ?? 0, 0, HALL_MAX_Z - FLOOR_VASE_WALL_OFFSET] satisfies Vec3,
      rotationY: index * 2,
    })),
  ),

  ...Array.from({ length: WEST_BENCH.segments }, (_, index) => ({
    id: `decor.westBench.${index + 1}`,
    assetId: 'decor.banquetteSegment',
    position: [
      WEST_WALL_X,
      0,
      WEST_BENCH.startZ + (index + 0.5) * BENCH_SEGMENT.segmentLength,
    ] satisfies Vec3,
    rotationY: Math.PI / 2,
  })),
  ...[0.9, 2.05, 3.3].map((offset, index) => ({
    id: `decor.westBenchCushion.${index + 1}`,
    assetId: index === 1 ? 'cushion.stripe' : 'cushion.sky',
    position: [
      WEST_WALL_X + BENCH_SEGMENT.backThickness + 0.09,
      BENCH_SEGMENT.seatHeight,
      WEST_BENCH.startZ + offset,
    ] satisfies Vec3,
    rotationY: Math.PI / 2 + (index - 1) * 0.08,
  })),
  {
    id: 'decor.wallArt',
    assetId: 'decor.wallArt',
    position: [WEST_WALL_X, WALL_ART_BOTTOM, (WEST_BENCH.startZ + BENCH_END_Z) / 2],
    rotationY: Math.PI / 2,
  },

  ...eastNiches.centersZ.flatMap((z, index) =>
    (['decor.nicheVase', 'decor.nicheFlowers'] as const).map((assetId) => ({
      id: `${assetId}.${index + 1}`,
      assetId,
      position: [HALL_MAX_X + eastNiches.depth / 2, eastNiches.bottom, z] satisfies Vec3,
      rotationY: index * 1.7,
    })),
  ),
];

// ---------------------------------------------------------------------------
// 해질녘 불빛 (실제 광원 없이 가산 혼합 면으로 그린다)
// ---------------------------------------------------------------------------

const WASH_WALL_OFFSET = 0.025;
const POOL_Y = 0.012;
const OUTER_PIER_X = 7.7;

export const warmLights: DecorPlacement[] = [
  ...[-OUTER_PIER_X, ...PIER_CENTERS, OUTER_PIER_X].map((x, index) => ({
    id: `light.wash.pier.${index + 1}`,
    assetId: 'light.wash',
    position: [x, 0, HALL_MAX_Z - WASH_WALL_OFFSET] satisfies Vec3,
    rotationY: Math.PI,
  })),
  ...EAST_NICHES.centersZ.map((z, index) => ({
    id: `light.wash.niche.${index + 1}`,
    assetId: 'light.wash',
    position: [EAST_WALL_X - WASH_WALL_OFFSET, 0, z] satisfies Vec3,
    rotationY: -Math.PI / 2,
  })),
  ...PENDANT_GRID.map(([xLine, zLine], index) => ({
    id: `light.pool.${index + 1}`,
    assetId: 'light.pool',
    position: [mullionLineX(xLine), POOL_Y, mullionLineZ(zLine)] satisfies Vec3,
    rotationY: 0,
  })),
  { id: 'light.pool.tree', assetId: 'light.pool', position: [0, POOL_Y, 6.4], rotationY: 0 },
];

/** 테라스 쪽 불빛: 건물 외벽의 업라이트와 테이블 아래 빛 웅덩이. */
export const terraceWarmLights: DecorPlacement[] = [
  ...[-OUTER_PIER_X, ...PIER_CENTERS, OUTER_PIER_X].map((x, index) => ({
    id: `light.wash.terrace.${index + 1}`,
    assetId: 'light.wash',
    position: [x, 0, ARCHITECTURE.terrace.minZ + WASH_WALL_OFFSET] satisfies Vec3,
    rotationY: 0,
  })),
  ...terraceTables.map((diningTable) => ({
    id: `light.pool.${diningTable.id}`,
    assetId: 'light.pool',
    position: [diningTable.position[0], POOL_Y, diningTable.position[2]] satisfies Vec3,
    rotationY: 0,
  })),
];

// ---------------------------------------------------------------------------
// 주방의 고정 소품
// ---------------------------------------------------------------------------

export const kitchenDecor: DecorPlacement[] = [
  { id: 'decor.herbPot.1', assetId: 'decor.herbPot', position: [-1.42, KITCHEN.counterHeight, -0.5], rotationY: 0 },
  { id: 'decor.herbPot.2', assetId: 'decor.herbPot', position: [2.95, KITCHEN.counterHeight, -0.5], rotationY: 1.2 },
  { id: 'decor.herbPot.3', assetId: 'decor.herbPot', position: [-0.5, KITCHEN.counterHeight, -2.5], rotationY: 2.3 },
];

// ---------------------------------------------------------------------------
// 테라스의 고정 소품
// ---------------------------------------------------------------------------

const { terrace: TERRACE } = ARCHITECTURE;
const { banquette: BANQUETTE } = TERRACE;
const TERRACE_WALL_Z = TERRACE.minZ;
const TERRACE_CENTER_Z = (TERRACE.minZ + TERRACE.maxZ) / 2;

const SAIL_CENTERS_X = [-6, 0, 6];
const LEMON_TREE_SPOTS: [x: number, z: number][] = [
  [-4, 13.05],
  [4, 13.05],
  [-9.3, 13.25],
  [9.3, 13.25],
];
const BOUGAINVILLEA_X = [-7.95, 7.95];

const BANQUETTE_BACK_Z = TERRACE.maxZ - TERRACE.railingThickness;
const BANQUETTE_RUN = BANQUETTE.segmentLength * BANQUETTE.segmentCount;
/** 뒷줄 쿠션은 등받이에 기대고, 앞줄 쿠션은 그 앞에 겹쳐 놓인다. */
const CUSHION_BACK_ROW_Z = BANQUETTE_BACK_Z - BANQUETTE.backThickness - 0.09;
const CUSHION_FRONT_ROW_Z = CUSHION_BACK_ROW_Z - 0.13;

/** 테이블 하나당 쿠션 묶음. 테이블 중심 기준 x, 테이블을 옮기면 함께 움직인다. */
const CUSHIONS_PER_TABLE = [
  { assetId: 'cushion.blue', dx: -1.32, row: 'back', twist: 0.1 },
  { assetId: 'cushion.stripe', dx: -0.86, row: 'front', twist: -0.12 },
  { assetId: 'cushion.blue', dx: -0.3, row: 'back', twist: -0.06 },
  { assetId: 'cushion.stripe', dx: 0.2, row: 'front', twist: 0.09 },
  { assetId: 'cushion.sky', dx: 0.82, row: 'back', twist: 0.07 },
  { assetId: 'cushion.stripe', dx: 1.3, row: 'front', twist: -0.1 },
] as const;

export const terraceDecor: DecorPlacement[] = [
  ...SAIL_CENTERS_X.map((x, index) => ({
    id: `decor.shadeSail.${index + 1}`,
    assetId: 'decor.shadeSail',
    position: [x, 0, TERRACE_CENTER_Z] satisfies Vec3,
    rotationY: 0,
  })),
  ...LEMON_TREE_SPOTS.map(([x, z], index) => ({
    id: `decor.lemonTree.${index + 1}`,
    assetId: 'decor.lemonTree',
    position: [x, 0, z] satisfies Vec3,
    rotationY: index * 1.3,
  })),
  ...BOUGAINVILLEA_X.map((x, index) => ({
    id: `decor.bougainvillea.${index + 1}`,
    assetId: 'decor.bougainvillea',
    position: [x, 0, TERRACE_WALL_Z] satisfies Vec3,
    rotationY: 0,
  })),
  ...Array.from({ length: BANQUETTE.segmentCount }, (_, index) => ({
    id: `decor.banquetteSegment.${index + 1}`,
    assetId: 'decor.banquetteSegment',
    position: [
      -BANQUETTE_RUN / 2 + (index + 0.5) * BANQUETTE.segmentLength,
      0,
      BANQUETTE_BACK_Z,
    ] satisfies Vec3,
    rotationY: Math.PI,
  })),
  ...terraceTables.flatMap((diningTable) =>
    CUSHIONS_PER_TABLE.map(({ assetId, dx, row, twist }, index) => ({
      id: `decor.cushion.${diningTable.id}.${index + 1}`,
      assetId,
      position: [
        diningTable.position[0] + dx,
        BANQUETTE.seatHeight,
        row === 'back' ? CUSHION_BACK_ROW_Z : CUSHION_FRONT_ROW_Z,
      ] satisfies Vec3,
      rotationY: Math.PI + twist,
    })),
  ),
];

// ---------------------------------------------------------------------------
// 바다와 원경
// ---------------------------------------------------------------------------

const { land: LAND, sea: SEA } = ARCHITECTURE;
const SHRUB_HALF_RUN = 12;
const SHRUB_SPACING = 1.5;
const SHRUB_COUNT = Math.floor((SHRUB_HALF_RUN * 2) / SHRUB_SPACING) + 1;

export const seascapeDecor: DecorPlacement[] = [
  ...Array.from({ length: SHRUB_COUNT }, (_, index) => ({
    id: `decor.shrub.${index + 1}`,
    assetId: 'decor.shrub',
    position: [
      -SHRUB_HALF_RUN + index * SHRUB_SPACING,
      LAND.layers.shrubShelf.topY,
      LAND.frontZ + 0.85 + (index % 2) * 0.5,
    ] satisfies Vec3,
    rotationY: index * 2.1,
  })),
  { id: 'decor.yacht.1', assetId: 'decor.yacht', position: [125, SEA.level, 250], rotationY: 0.6 },
  { id: 'decor.yacht.2', assetId: 'decor.yacht', position: [330, SEA.level, 520], rotationY: -0.4 },
  { id: 'decor.yacht.3', assetId: 'decor.yacht', position: [-45, SEA.level, 390], rotationY: 2.4 },
  { id: 'decor.island.1', assetId: 'decor.island', position: [620, SEA.level, 880], rotationY: 0.25 },
  { id: 'decor.island.2', assetId: 'decor.island', position: [-340, SEA.level, 1050], rotationY: -0.15 },
  { id: 'decor.cloud.1', assetId: 'decor.cloud', position: [-260, 150, 820], rotationY: 0.1 },
  { id: 'decor.cloud.2', assetId: 'decor.cloud', position: [60, 190, 1120], rotationY: -0.2 },
  { id: 'decor.cloud.3', assetId: 'decor.cloud', position: [430, 165, 950], rotationY: 0.3 },
  { id: 'decor.cloud.4', assetId: 'decor.cloud', position: [760, 230, 1000], rotationY: -0.5 },
  { id: 'decor.cloud.5', assetId: 'decor.cloud', position: [-620, 210, 980], rotationY: 0.4 },
];
