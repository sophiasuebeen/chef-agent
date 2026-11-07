import type { Language } from '../game/language';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { memo, useLayoutEffect, useRef, type ReactNode } from 'react';
import type { Object3D } from 'three';
import type { CameraPresetId } from '../data/cameraPresets';
import { DEFAULT_TIME_OF_DAY, type TimeOfDayId } from '../data/timeOfDay';
import { useSceneStore } from '../state/sceneStore';
import { CameraRig, type UiSafeArea } from './cameras/CameraRig';
import { LayoutDebug } from './debug/LayoutDebug';
import { PerfProbe } from './debug/PerfProbe';
import { PerformanceGovernor } from './lighting/PerformanceGovernor';
import type { SceneObjectRef } from './Interactable';
import { Lighting } from './lighting/Lighting';
import { PostEffects } from './lighting/PostEffects';
import { DiningHall } from './zones/DiningHall';
import { Kitchen } from './zones/Kitchen';
import { Seascape } from './zones/Seascape';
import { Terrace } from './zones/Terrace';
import { KitchenReplay } from './kitchen/KitchenReplay';
import type { KitchenFrame } from './replayPresentation';
import { stations, type Vec3 } from '../data/layout';

export type { SceneObjectRef } from './Interactable';
export type { UiSafeArea } from './cameras/CameraRig';

export interface BeachRestaurantSceneProps {
  cameraPreset: CameraPresetId;
  /** 기본값은 늦은 오후의 골든아워. */
  timeOfDay?: TimeOfDayId;
  highlightedIds?: string[];
  onObjectClick?: (event: SceneObjectRef) => void;
  onObjectHover?: (event: SceneObjectRef | null) => void;
  uiSafeArea?: UiSafeArea;
  /** Same simulated timestamp and sequence as the replay controls; never wall-clock time. */
  replayFrame?: KitchenFrame;
  /** Live play: chefs walk in real time. */
  live?: boolean;
  equipmentCount?: number;
  pantryIngredients?: string[];
  language?: Language;
  speech?: { speaker: string; text: string };
  /** Something in `children` drives the camera, so the preset rig stands down. */
  ownCamera?: boolean;
  onFloorClick?: (x: number, z: number) => void;
  children?: ReactNode;
}

const StaticKitchen = memo(Kitchen);
const StaticDiningHall = memo(DiningHall);
const StaticTerrace = memo(Terrace);
const StaticSeascape = memo(Seascape);

/** 맞은 메시에서 위로 올라가 가장 가까운 상호작용 물건을 찾는다 (GLB 자식 메시도 동일). */
function findInteractable(hit: Object3D): SceneObjectRef | null {
  for (let object: Object3D | null = hit; object; object = object.parent) {
    const { kind, id } = object.userData as { kind?: unknown; id?: unknown };
    if (typeof kind === 'string' && typeof id === 'string') return { kind, id };
  }
  return null;
}

interface PointerRootProps {
  onObjectClick?: (event: SceneObjectRef) => void;
  onObjectHover?: (event: SceneObjectRef | null) => void;
  onFloorClick?: (x: number, z: number) => void;
  children: ReactNode;
}

function PointerRoot({ onObjectClick, onObjectHover, onFloorClick, children }: PointerRootProps) {
  const setHoveredId = useSceneStore((state) => state.setHoveredId);
  const lastHover = useRef<string | null>(null);
  const clearPending = useRef(false);

  const applyHover = (next: SceneObjectRef | null) => {
    const nextId = next?.id ?? null;
    if (nextId === lastHover.current) return;
    lastHover.current = nextId;
    setHoveredId(nextId);
    document.body.style.cursor = next ? 'pointer' : '';
    onObjectHover?.(next);
  };

  return (
    <group
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        const hit = findInteractable(event.object);
        if (hit) onObjectClick?.(hit);
        onFloorClick?.(event.point.x, event.point.z);
      }}
      onPointerMove={(event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        clearPending.current = false;
        applyHover(findInteractable(event.object));
      }}
      onPointerOut={() => {
        // 메시 사이를 옮겨 갈 때 out → move 순서로 오므로, 같은 틱에 move가 없을 때만 해제한다.
        clearPending.current = true;
        queueMicrotask(() => {
          if (clearPending.current) applyHover(null);
        });
      }}
    >
      {children}
    </group>
  );
}

/** 외부에 공개하는 유일한 장면 컴포넌트. 부모 요소를 가득 채운다. */
export function BeachRestaurantScene({
  cameraPreset,
  timeOfDay = DEFAULT_TIME_OF_DAY,
  highlightedIds,
  onObjectClick,
  onObjectHover,
  uiSafeArea,
  replayFrame,
  live,
  speech,
  ownCamera,
  equipmentCount,
  pantryIngredients,
  language,
  onFloorClick,
  children,
}: BeachRestaurantSceneProps) {
  const setCameraPreset = useSceneStore((state) => state.setCameraPreset);
  const setHighlightedIds = useSceneStore((state) => state.setHighlightedIds);
  const setTimeOfDay = useSceneStore((state) => state.setTimeOfDay);
  const chefStation = stations.find((station) => station.type === (replayFrame?.chef.station ?? 'pass'))!;
  const chefFocus: Vec3 = [chefStation.chefSpot[0], 1.15, chefStation.chefSpot[2]];

  useLayoutEffect(() => setCameraPreset(cameraPreset), [cameraPreset, setCameraPreset]);
  useLayoutEffect(() => setTimeOfDay(timeOfDay), [timeOfDay, setTimeOfDay]);
  useLayoutEffect(() => {
    if (highlightedIds) setHighlightedIds(highlightedIds);
  }, [highlightedIds, setHighlightedIds]);

  return (
    <Canvas shadows="soft" dpr={[1, 1.5]} gl={{ antialias: false, stencil: false }} camera={{ near: 0.2, far: 3200 }}>
      <Lighting shadowTime={replayFrame?.time} shadowSequence={replayFrame?.sequence} shadowChefs={replayFrame?.chefs.length} />
      {!ownCamera && <CameraRig uiSafeArea={uiSafeArea} chefFocus={chefFocus} />}
      <PointerRoot onObjectClick={onObjectClick} onObjectHover={onObjectHover} onFloorClick={onFloorClick}>
        <StaticKitchen />
        <KitchenReplay frame={replayFrame} live={live} speech={speech} equipmentCount={equipmentCount} ingredients={pantryIngredients} language={language} />
        {children}
        <StaticDiningHall showDemoFood={!ownCamera} />
        <StaticTerrace showDemoFood={!ownCamera} />
        <StaticSeascape />
      </PointerRoot>
      <LayoutDebug />
      <PostEffects />
      <PerformanceGovernor />
      <PerfProbe />
    </Canvas>
  );
}
