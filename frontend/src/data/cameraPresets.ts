import type { Vec3 } from './layout';

export const CAMERA_PRESET_IDS = ['overview', 'dining', 'terrace', 'kitchen'] as const;
export type CameraPresetId = (typeof CAMERA_PRESET_IDS)[number];

export interface CameraPreset {
  position: Vec3;
  /** layout.ts의 cameraTarget 앵커 id. */
  targetAnchorId: string;
  /** referenceAspect 화면에서의 세로 시야각(도). */
  fov: number;
  /** 심도를 쓰는 감상용 구도에서 초점을 맞출 거리(m). 없으면 심도를 끈다. */
  focusDistance?: number;
}

/** 프리셋의 화각을 설계한 기준 화면비. 더 좁은 화면에서는 가로 시야를 유지하도록 넓힌다. */
export const REFERENCE_ASPECT = 16 / 9;

export const cameraPresets: Record<CameraPresetId, CameraPreset> = {
  overview: { position: [-20, 30, -9], targetAnchorId: 'camTarget.overview', fov: 40 },
  // 앉은 눈높이의 좁은 화각. 앞쪽 테이블이 프레임을 채우고 나무와 아치가 깊이를 만든다.
  dining: { position: [-1.4, 1.22, 0.75], targetAnchorId: 'camTarget.dining', fov: 45, focusDistance: 7 },
  terrace: { position: [-6.4, 1.3, 15.55], targetAnchorId: 'camTarget.terrace', fov: 38, focusDistance: 5 },
  // 평면도의 게임 카메라: 높이 4.7m, 픽업 존 뒤쪽에서 주방을 내려다본다 (가로 시야 약 90도).
  kitchen: { position: [0, 4.7, 2.7], targetAnchorId: 'camTarget.kitchen', fov: 58 },
};
