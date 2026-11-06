import type { AssetPart } from '../../assets/registry';
import type { BufferGeometry } from 'three';
import { PlaneGeometry } from 'three';
import { POOL_RADIUS, WASH_HEIGHT, WASH_WIDTH } from '../materials/textures';
import { cylinder, blob, mergeStatic } from './geometry';

/** 겹겹이 쌓인 원반 갓. 위에서 아래 순서의 반지름. */
const DISC_RADII = [0.2, 0.34, 0.44, 0.48, 0.44, 0.32, 0.17];
const DISC_PITCH = 0.085;
const DISC_THICKNESS = 0.05;

function discStack(topY: number, scale = 1): BufferGeometry {
  return mergeStatic(
    DISC_RADII.map((radius, index) =>
      blob(
        [radius * scale, DISC_THICKNESS * scale, radius * scale],
        [0, topY - index * DISC_PITCH * scale, 0],
        2,
      ),
    ),
  );
}

const CORD_LENGTH = 3;
const PENDANT_SCALE = 0.62;

/** 로컬 원점은 줄을 매다는 천장 쪽 끝이고, 등은 그 아래에 있다. */
export const pendantParts: AssetPart[] = [
  { material: 'cord', geometry: mergeStatic([cylinder(0.006, 0.006, CORD_LENGTH, [0, -CORD_LENGTH / 2, 0], 6)]), castShadow: false },
  { material: 'lampGlow', geometry: discStack(-CORD_LENGTH, PENDANT_SCALE) },
];

const POLE_HEIGHT = 1.15;

/** 같은 원반 갓을 줄여 얹은 스탠드. 원점은 바닥. */
export const standingLampParts: AssetPart[] = [
  {
    material: 'walnut',
    geometry: mergeStatic([
      cylinder(0.17, 0.18, 0.03, [0, 0.015, 0], 20),
      cylinder(0.012, 0.012, POLE_HEIGHT, [0, POLE_HEIGHT / 2, 0], 8),
    ]),
  },
  { material: 'lampGlow', geometry: discStack(POLE_HEIGHT + 0.3, 0.5) },
];

function wallWashPlane() {
  const plane = new PlaneGeometry(WASH_WIDTH, WASH_HEIGHT);
  plane.translate(0, WASH_HEIGHT / 2, 0);
  return plane;
}

function floorPoolPlane() {
  const plane = new PlaneGeometry(POOL_RADIUS * 2, POOL_RADIUS * 2);
  plane.rotateX(-Math.PI / 2);
  return plane;
}

/** 벽을 비추는 업라이트의 빛 번짐. 원점은 벽 아래, 앞면이 +z. */
export const wallWashParts: AssetPart[] = [
  { material: 'wallWash', geometry: mergeStatic([wallWashPlane()]), castShadow: false },
];

/** 바닥에 고이는 불빛. */
export const lightPoolParts: AssetPart[] = [
  { material: 'lightPool', geometry: mergeStatic([floorPoolPlane()]), castShadow: false },
];
