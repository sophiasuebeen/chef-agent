import { useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useRef } from 'react';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { cameraPresets, REFERENCE_ASPECT } from '../../data/cameraPresets';
import { anchors } from '../../data/layout';
import { useSceneStore } from '../../state/sceneStore';

export interface UiSafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const NO_SAFE_AREA: UiSafeArea = { top: 0, right: 0, bottom: 0, left: 0 };
const MAX_FOV = 110;
const DAMPING = 3.5;
const MIN_SAFE_PIXELS = 64;

interface Framing {
  fov: number;
  offsetX: number;
  offsetY: number;
}

/**
 * UI를 뺀 영역 안에 프리셋 화면 전체(기준 화면비)가 들어오도록 시야각과 광학 중심을 계산한다.
 * 카메라를 물리적으로 옮기지 않으므로 벽을 뚫지 않는다.
 */
export function computeFraming(
  presetFov: number,
  width: number,
  height: number,
  safeArea: UiSafeArea,
): Framing {
  const safeWidth = Math.max(MIN_SAFE_PIXELS, width - safeArea.left - safeArea.right);
  const safeHeight = Math.max(MIN_SAFE_PIXELS, height - safeArea.top - safeArea.bottom);
  const presetTan = Math.tan(MathUtils.degToRad(presetFov / 2));
  const safeTan = presetTan * Math.max(1, REFERENCE_ASPECT / (safeWidth / safeHeight));
  const fullTan = safeTan * (height / safeHeight);
  return {
    fov: Math.min(MAX_FOV, MathUtils.radToDeg(Math.atan(fullTan)) * 2),
    offsetX: (safeArea.right - safeArea.left) / 2,
    offsetY: (safeArea.bottom - safeArea.top) / 2,
  };
}

function anchorPosition(id: string): Vector3 {
  const anchor = anchors.find((candidate) => candidate.id === id);
  if (!anchor) throw new Error(`Unknown camera target anchor: ${id}`);
  return new Vector3(...anchor.position);
}

export function CameraRig({ uiSafeArea = NO_SAFE_AREA }: { uiSafeArea?: UiSafeArea }) {
  const camera = useThree((state) => state.camera);
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);
  const presetId = useSceneStore((state) => state.cameraPreset);
  const preset = cameraPresets[presetId];

  const { top, right, bottom, left } = uiSafeArea;
  const framing = computeFraming(preset.fov, width, height, { top, right, bottom, left });

  const goalPosition = useRef(new Vector3());
  const goalTarget = useRef(new Vector3());
  const currentTarget = useRef(new Vector3());
  const goalFov = useRef(framing.fov);
  const initialized = useRef(false);

  useLayoutEffect(() => {
    goalPosition.current.set(...preset.position);
    goalTarget.current.copy(anchorPosition(preset.targetAnchorId));
    goalFov.current = framing.fov;
    if (!(camera instanceof PerspectiveCamera)) return;

    if (!initialized.current) {
      initialized.current = true;
      camera.position.copy(goalPosition.current);
      currentTarget.current.copy(goalTarget.current);
      camera.fov = framing.fov;
      camera.lookAt(currentTarget.current);
    }

    if (framing.offsetX === 0 && framing.offsetY === 0) {
      camera.clearViewOffset();
    } else {
      camera.setViewOffset(width, height, framing.offsetX, framing.offsetY, width, height);
    }
    camera.updateProjectionMatrix();
  }, [camera, preset, framing.fov, framing.offsetX, framing.offsetY, width, height]);

  useFrame((_, delta) => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const step = Math.min(delta, 0.1);
    camera.position.x = MathUtils.damp(camera.position.x, goalPosition.current.x, DAMPING, step);
    camera.position.y = MathUtils.damp(camera.position.y, goalPosition.current.y, DAMPING, step);
    camera.position.z = MathUtils.damp(camera.position.z, goalPosition.current.z, DAMPING, step);
    currentTarget.current.x = MathUtils.damp(currentTarget.current.x, goalTarget.current.x, DAMPING, step);
    currentTarget.current.y = MathUtils.damp(currentTarget.current.y, goalTarget.current.y, DAMPING, step);
    currentTarget.current.z = MathUtils.damp(currentTarget.current.z, goalTarget.current.z, DAMPING, step);
    camera.lookAt(currentTarget.current);
    if (Math.abs(camera.fov - goalFov.current) > 0.01) {
      camera.fov = MathUtils.damp(camera.fov, goalFov.current, DAMPING, step);
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
