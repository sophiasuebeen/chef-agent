import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Box3, BoxGeometry, Matrix4, type Group, type Mesh, type Object3D, Vector3 } from 'three';
import { useSceneStore } from '../state/sceneStore';
import type { Vec3 } from '../data/layout';

/** 외곽선 상자는 물건에 파묻히지 않도록 살짝 크게 잡는다. */
const UNIT_BOX = new BoxGeometry(1.02, 1.02, 1.02);

export type InteractableKind = 'station' | 'table' | 'seat' | 'passRail' | 'plateSlot';

export interface SceneObjectRef {
  kind: string;
  id: string;
}

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true;
}

/** 그룹의 로컬 좌표계 기준 경계 상자. 회전한 물건도 딱 맞게 감싼다. */
function measureLocalBounds(group: Group): Box3 {
  group.updateWorldMatrix(true, true);
  const worldToGroup = new Matrix4().copy(group.matrixWorld).invert();
  const bounds = new Box3();
  const meshBounds = new Box3();
  group.traverse((object) => {
    if (!isMesh(object) || object.userData.isOutline === true) return;
    object.geometry.computeBoundingBox();
    if (!object.geometry.boundingBox) return;
    meshBounds.copy(object.geometry.boundingBox);
    meshBounds.applyMatrix4(new Matrix4().multiplyMatrices(worldToGroup, object.matrixWorld));
    bounds.union(meshBounds);
  });
  return bounds;
}

function OutlineBox({ target, color }: { target: Group; color: string }) {
  const [bounds, setBounds] = useState<{ center: Vector3; size: Vector3 } | null>(null);
  useLayoutEffect(() => {
    const box = measureLocalBounds(target);
    if (box.isEmpty()) return;
    setBounds({ center: box.getCenter(new Vector3()), size: box.getSize(new Vector3()) });
  }, [target]);
  if (!bounds) return null;
  return (
    <group position={bounds.center} scale={bounds.size} raycast={() => null}>
      <lineSegments raycast={() => null} renderOrder={10}>
        <edgesGeometry args={[UNIT_BOX]} />
        <lineBasicMaterial color={color} depthTest={false} transparent toneMapped={false} />
      </lineSegments>
    </group>
  );
}

interface InteractableProps {
  kind: InteractableKind;
  id: string;
  position: Vec3;
  rotationY?: number;
  children: ReactNode;
}

/**
 * 상호작용 물건의 공통 껍데기: layout id를 Object3D.name과 userData에 넣고
 * 하이라이트/호버 외곽선을 그린다. 클릭·호버 판정은 장면 루트가 userData로 수행한다.
 */
export function Interactable({ kind, id, position, rotationY = 0, children }: InteractableProps) {
  const [group, setGroup] = useState<Group | null>(null);
  const highlighted = useSceneStore((state) => state.highlightedIds.includes(id));
  const hovered = useSceneStore((state) => state.hoveredId === id);
  const groupRef = useRef<Group>(null);
  useLayoutEffect(() => setGroup(groupRef.current), []);

  return (
    <group ref={groupRef} name={id} userData={{ kind, id }} position={position} rotation={[0, rotationY, 0]}>
      {children}
      {group && (highlighted || hovered) && (
        <OutlineBox target={group} color={highlighted ? '#ff7a1a' : '#ffffff'} />
      )}
    </group>
  );
}
