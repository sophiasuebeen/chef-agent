import {
  CatmullRomCurve3,
  TubeGeometry,
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  OctahedronGeometry,
  LatheGeometry,
  Quaternion,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Vec3 } from '../../data/layout';

/**
 * 면의 방향에 따라 미터 단위 UV를 다시 만든다(박스 투영). 텍스처 크기가 물건 크기와
 * 무관해지므로 벽, 바닥, 소품이 같은 스케일의 질감을 갖는다.
 */
export function boxProjectUVs(source: BufferGeometry): BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source;
  const position = geometry.getAttribute('position');
  const uv = new Float32Array(position.count * 2);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const normal = new Vector3();
  for (let vertex = 0; vertex + 2 < position.count; vertex += 3) {
    a.fromBufferAttribute(position, vertex);
    b.fromBufferAttribute(position, vertex + 1);
    c.fromBufferAttribute(position, vertex + 2);
    normal.copy(b).sub(a).cross(c.clone().sub(a));
    const x = Math.abs(normal.x);
    const y = Math.abs(normal.y);
    const z = Math.abs(normal.z);
    [a, b, c].forEach((corner, offset) => {
      const index = (vertex + offset) * 2;
      if (y >= x && y >= z) {
        uv[index] = corner.x;
        uv[index + 1] = corner.z;
      } else if (x >= z) {
        uv[index] = corner.z;
        uv[index + 1] = corner.y;
      } else {
        uv[index] = corner.x;
        uv[index + 1] = corner.y;
      }
    });
  }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  return geometry;
}

/** 메시 하나로 합친다. 소품과 건축물의 draw call을 줄이는 기본 수단. */
export function mergeStatic(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts.map((part) => (part.index ? part.toNonIndexed() : part)));
  if (!merged) throw new Error('Static geometry parts have incompatible attributes');
  return merged;
}

/** 두 모서리 사이를 채우는 상자. */
export function boxBetween(min: Vec3, max: Vec3): BufferGeometry {
  return box(max[0] - min[0], max[1] - min[1], max[2] - min[2], [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ]);
}

export function box(width: number, height: number, depth: number, center: Vec3 = [0, 0, 0]) {
  const geometry = new BoxGeometry(width, height, depth);
  geometry.translate(...center);
  return geometry;
}

export function roundedBox(
  width: number,
  height: number,
  depth: number,
  radius: number,
  center: Vec3 = [0, 0, 0],
  segments = 2,
) {
  const geometry = new RoundedBoxGeometry(width, height, depth, segments, radius);
  geometry.translate(...center);
  return geometry;
}

export function cylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  center: Vec3 = [0, 0, 0],
  segments = 16,
) {
  const geometry = new CylinderGeometry(radiusTop, radiusBottom, height, segments);
  geometry.translate(...center);
  return geometry;
}

/** [반지름, 높이] 외곽선을 y축으로 회전시킨 도형. 화병, 잔, 접시에 쓴다. */
export function lathe(profile: [radius: number, y: number][], segments = 20) {
  return new LatheGeometry(
    profile.map(([radius, y]) => new Vector2(radius, y)),
    segments,
  );
}

export function blob(radii: Vec3, center: Vec3 = [0, 0, 0], detail = 1) {
  const geometry = new IcosahedronGeometry(1, detail);
  geometry.scale(...radii);
  geometry.translate(...center);
  return geometry;
}

const UP = new Vector3(0, 1, 0);

/** 두 점을 잇는 원뿔대. 나뭇가지와 줄기에 쓴다. */
export function limb(from: Vec3, to: Vec3, radiusFrom: number, radiusTo: number, segments = 7) {
  const start = new Vector3(...from);
  const end = new Vector3(...to);
  const direction = end.clone().sub(start);
  const geometry = new CylinderGeometry(radiusTo, radiusFrom, direction.length(), segments);
  geometry.applyQuaternion(new Quaternion().setFromUnitVectors(UP, direction.clone().normalize()));
  const middle = start.add(end).multiplyScalar(0.5);
  geometry.translate(middle.x, middle.y, middle.z);
  return geometry;
}

/** 점들을 부드럽게 잇는 둥근 관. 곡선 의자 프레임에 쓴다. */
export function tube(points: Vec3[], radius: number, tubularSegments = 24, radialSegments = 8) {
  const curve = new CatmullRomCurve3(points.map((point) => new Vector3(...point)));
  return new TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
}

/** 절차적 소품이 매번 같은 모양이 되도록 시드를 고정한 난수. */
export function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** center 주변의 타원체 안에 납작한 잎을 흩뿌린다. */
export function leafCluster(
  random: () => number,
  center: Vec3,
  spread: Vec3,
  count: number,
  leafSize: Vec3,
): BufferGeometry[] {
  const leaves: BufferGeometry[] = [];
  for (let index = 0; index < count; index += 1) {
    // 납작한 잎은 면이 적어도 차이가 없다. 팔면체면 잎 하나가 8면으로 끝난다.
    const leaf = new OctahedronGeometry(1, 0);
    leaf.scale(...leafSize);
    leaf.rotateX((random() - 0.5) * 1.3);
    leaf.rotateY(random() * Math.PI * 2);
    leaf.rotateZ((random() - 0.5) * 1.3);
    const angle = random() * Math.PI * 2;
    const elevation = Math.acos(2 * random() - 1);
    const distance = Math.cbrt(random());
    leaf.translate(
      center[0] + Math.sin(elevation) * Math.cos(angle) * distance * spread[0],
      center[1] + Math.cos(elevation) * distance * spread[1],
      center[2] + Math.sin(elevation) * Math.sin(angle) * distance * spread[2],
    );
    leaves.push(leaf);
  }
  return leaves;
}
