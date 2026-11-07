import { useMemo } from 'react';
import type { BufferGeometry } from 'three';
import type { DetailTier } from '../../assets/registry';
import { useSceneStore } from '../../state/sceneStore';
import { detailMaterial, type MaterialKey, palette } from '../materials/palette';
import { boxProjectUVs } from '../props/geometry';

interface StaticMeshProps {
  /** 렌더마다 다시 만들지 않도록 인자 없는 빌더를 받는다. */
  build: () => BufferGeometry;
  material: MaterialKey;
  tier?: DetailTier;
  castShadow?: boolean;
  /** false면 레이캐스트를 통과한다. 지붕 너머의 테이블을 위에서 클릭할 수 있게 한다. */
  blocksPointer?: boolean;
  /** Overview and kitchen playback cameras cut roofs away while preserving shadows. */
  cutaway?: boolean;
}

/** 합쳐진 건축 지오메트리 한 덩어리. 재질 하나당 draw call 하나. */
export function StaticMesh({
  build,
  material,
  tier = 'background',
  castShadow = true,
  blocksPointer = true,
  cutaway = false,
}: StaticMeshProps) {
  const geometry = useMemo(() => boxProjectUVs(build()), [build]);
  const detailMode = useSceneStore((state) => state.debug.detailColorMode);
  const isCut = useSceneStore((state) => cutaway && ['overview', 'kitchen', 'chef'].includes(state.cameraPreset));
  const base = detailMode ? detailMaterial(tier) : palette[material];
  const hidden = useMemo(() => {
    const clone = base.clone();
    clone.colorWrite = false;
    clone.depthWrite = false;
    return clone;
  }, [base]);
  return (
    <mesh
      geometry={geometry}
      material={isCut ? hidden : base}
      castShadow={castShadow}
      receiveShadow
      {...(blocksPointer ? {} : { raycast: () => null })}
    />
  );
}
