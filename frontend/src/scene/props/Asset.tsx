import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react';
import {
  Box3,
  BoxGeometry,
  type BufferGeometry,
  type InstancedMesh,
  type Material,
  Matrix4,
  type Mesh,
  type Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { getAssetEntry, type AssetPart, type AssetProps, type DetailTier } from '../../assets/registry';
import type { DecorPlacement } from '../../data/layout';
import { useSceneStore } from '../../state/sceneStore';
import { detailMaterial, palette } from '../materials/palette';

function usePartMaterial(part: AssetPart, tier: DetailTier): Material {
  const detailMode = useSceneStore((state) => state.debug.detailColorMode);
  return detailMode ? detailMaterial(tier) : palette[part.material];
}

/** Draco 디코더를 CDN에서 받지 않도록 압축 해제를 끈다 (런타임 외부 네트워크 금지). */
function GlbAsset({ url, fitHeight, tier }: { url: string; fitHeight: number; tier: DetailTier }) {
  const { scene } = useGLTF(url, false);
  const detailMode = useSceneStore((state) => state.debug.detailColorMode);
  const gl = useThree((state) => state.gl);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    const bounds = new Box3().setFromObject(clone);
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    const scale = size.y > 0 ? fitHeight / size.y : 1;
    clone.scale.setScalar(scale);
    clone.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    return clone;
  }, [scene, fitHeight]);

  useLayoutEffect(() => {
    model.traverse((object) => {
      if (!isMesh(object)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      object.raycast = () => undefined;
      const original = (object.userData.originalMaterial ??= object.material) as Material;
      object.material = detailMode ? detailMaterial(tier) : original;
    });
    gl.shadowMap.needsUpdate = true;
  }, [gl, model, detailMode, tier]);

  return <primitive object={model} />;
}

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true;
}

function SinglePart({ part, tier }: { part: AssetPart; tier: DetailTier }) {
  const material = usePartMaterial(part, tier);
  return (
    <mesh
      geometry={part.geometry}
      material={material}
      castShadow={part.castShadow !== false}
      receiveShadow
      raycast={() => null}
    />
  );
}

/** 소품 하나를 그린다. 반복되는 소품은 PlacedAssets를 쓴다. */
export function Asset({ id, ...props }: AssetProps & { id: string }) {
  const entry = getAssetEntry(id);
  if (entry.type === 'glb') {
    return (
      <Suspense fallback={null}>
        <GlbAsset url={entry.url} fitHeight={entry.fitHeight} tier={entry.tier} />
      </Suspense>
    );
  }
  if (entry.type === 'parts') {
    return (
      <>
        {entry.parts.map((part, index) => (
          <SinglePart key={index} part={part} tier={entry.tier} />
        ))}
      </>
    );
  }
  const Component = entry.component;
  return <Component {...props} />;
}

const UP_AXIS = new Vector3(0, 1, 0);
const UNIT_SCALE = new Vector3(1, 1, 1);

interface InstancedPartProps {
  geometry: BufferGeometry;
  part: AssetPart;
  tier: DetailTier;
  placements: DecorPlacement[];
}

function InstancedPart({ geometry, part, tier, placements }: InstancedPartProps) {
  const material = usePartMaterial(part, tier);
  const ref = useRef<InstancedMesh>(null);
  const gl = useThree((state) => state.gl);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new Matrix4();
    const rotation = new Quaternion();
    const position = new Vector3();
    placements.forEach((placement, index) => {
      position.set(...placement.position);
      rotation.setFromAxisAngle(UP_AXIS, placement.rotationY);
      mesh.setMatrixAt(index, matrix.compose(position, rotation, UNIT_SCALE));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    gl.shadowMap.needsUpdate = true;
  }, [placements, gl]);

  return (
    <instancedMesh
      key={placements.length}
      ref={ref}
      args={[geometry, material, placements.length]}
      castShadow={part.castShadow !== false}
      receiveShadow
      raycast={() => null}
    />
  );
}

/**
 * 배치 목록을 소품 id별로 묶어 그린다. parts 소품은 InstancedMesh가 되어
 * 재질 하나당 draw call 하나로 끝나고, 나머지는 하나씩 Asset으로 그린다.
 */
export function PlacedAssets({ placements }: { placements: DecorPlacement[] }) {
  const groups = useMemo(() => {
    const byAsset = new Map<string, DecorPlacement[]>();
    for (const placement of placements) {
      const group = byAsset.get(placement.assetId);
      if (group) group.push(placement);
      else byAsset.set(placement.assetId, [placement]);
    }
    return [...byAsset.entries()];
  }, [placements]);

  return (
    <>
      {groups.map(([assetId, group]) => {
        const entry = getAssetEntry(assetId);
        if (entry.type === 'parts') {
          return entry.parts.map((part, index) => (
            <InstancedPart
              key={`${assetId}.${index}`}
              geometry={part.geometry}
              part={part}
              tier={entry.tier}
              placements={group}
            />
          ));
        }
        return group.map((placement) => (
          <group
            key={placement.id}
            name={placement.id}
            position={placement.position}
            rotation={[0, placement.rotationY, 0]}
          >
            <Asset id={assetId} />
          </group>
        ));
      })}
    </>
  );
}

const UNIT_BOX = new BoxGeometry(1, 1, 1);

/**
 * 보이지 않는 클릭 판정 상자. 렌더 비용이 없고, 인스턴싱되거나 GLB로 바뀐
 * 소품도 Interactable의 name/userData로 똑같이 식별된다.
 */
export function HitProxy({ assetId }: { assetId: string }) {
  const { hitSize } = getAssetEntry(assetId);
  if (!hitSize) throw new Error(`Asset ${assetId} has no hitSize`);
  return (
    <mesh
      geometry={UNIT_BOX}
      visible={false}
      position={[0, hitSize[1] / 2, 0]}
      scale={hitSize}
    />
  );
}
