import { PlaneGeometry, type BufferGeometry } from 'three';
import type { AssetPart } from '../../assets/registry';
import { mergeStatic, roundedBox } from './geometry';

const PLINTH_HEIGHT = 0.28;
const SEAT_TOP = 0.46;
const SEGMENT_LENGTH = 1.2;
const SEAM = 0.012;
const SEAT_DEPTH = 0.72;
const BACK_THICKNESS = 0.17;
const BACK_TOP = 0.88;

/**
 * 소파 한 칸: 도톰한 방석과 둥근 등받이. 원점은 난간 쪽 바닥, 앞면이 +z.
 * 칸 사이의 작은 틈이 재봉선처럼 보인다.
 */
export const banquetteSegmentParts: AssetPart[] = [
  {
    material: 'sofaFabric',
    geometry: mergeStatic([
      roundedBox(
        SEGMENT_LENGTH - SEAM,
        SEAT_TOP - PLINTH_HEIGHT,
        SEAT_DEPTH,
        0.055,
        [0, (SEAT_TOP + PLINTH_HEIGHT) / 2, SEAT_DEPTH / 2 + 0.03],
        4,
      ),
      roundedBox(
        SEGMENT_LENGTH - SEAM,
        BACK_TOP - PLINTH_HEIGHT,
        BACK_THICKNESS,
        0.075,
        [0, (BACK_TOP + PLINTH_HEIGHT) / 2, BACK_THICKNESS / 2],
        4,
      ),
    ]),
  },
];

const PILLOW_GRID = 12;

interface PillowShape {
  width: number;
  height: number;
  thickness: number;
  /** 네 변이 안쪽으로 파이는 정도. 속을 채운 베개의 뾰족한 모서리가 여기서 나온다. */
  pinch: number;
  /** 등받이 쪽으로 기대는 각도(라디안). */
  lean: number;
}

/** 속이 찬 베개: 가운데가 불룩하고 가장자리는 칼날처럼 만나며 변이 안으로 파인다. */
function pillow({ height, lean, pinch, thickness, width }: PillowShape): BufferGeometry {
  const sides = [1, -1].map((facing) => {
    const side = new PlaneGeometry(1, 1, PILLOW_GRID, PILLOW_GRID);
    if (facing < 0) side.rotateY(Math.PI);
    const position = side.getAttribute('position');
    for (let index = 0; index < position.count; index += 1) {
      const u = position.getX(index) * 2;
      const v = position.getY(index) * 2;
      const fill = Math.max(0, (1 - Math.abs(u) ** 2.4) * (1 - Math.abs(v) ** 2.4));
      const halfWidth = (width / 2) * (1 - pinch * (1 - v * v));
      const halfHeight = (height / 2) * (1 - pinch * (1 - u * u));
      position.setXYZ(
        index,
        u * halfWidth,
        // 무게로 아랫부분이 살짝 처진다.
        v * halfHeight - 0.012 * (1 - u * u) * (1 - v) * 0.5,
        facing * (thickness / 2) * fill ** 0.5,
      );
    }
    side.computeVertexNormals();
    return side;
  });
  const merged = mergeStatic(sides);
  merged.rotateX(-lean);
  merged.translate(0, (height / 2) * Math.cos(lean), 0);
  return merged;
}

const SQUARE_PILLOW: PillowShape = { width: 0.52, height: 0.48, thickness: 0.2, pinch: 0.07, lean: 0.24 };
const LUMBAR_PILLOW: PillowShape = { width: 0.56, height: 0.34, thickness: 0.17, pinch: 0.06, lean: 0.34 };

/** 소파에 기대는 쿠션. 원점은 방석 위, 앞면이 +z. */
export const cushionBlueParts: AssetPart[] = [
  { material: 'pillowBlue', geometry: pillow(SQUARE_PILLOW) },
];

export const cushionSkyParts: AssetPart[] = [
  { material: 'pillowSky', geometry: pillow(SQUARE_PILLOW) },
];

/** 가로 골이 진 베이지 럼버 쿠션. 앞줄에 겹쳐 놓인다. */
export const cushionStripeParts: AssetPart[] = [
  { material: 'pillowStripe', geometry: pillow(LUMBAR_PILLOW) },
];
