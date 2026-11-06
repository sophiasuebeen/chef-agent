import { create } from 'zustand';
import type { CameraPresetId } from '../data/cameraPresets';
import { DEFAULT_TIME_OF_DAY, type TimeOfDayId } from '../data/timeOfDay';

export type AoMode = 'auto' | 'on' | 'off';

/** 0: 전체 품질, 1: AO·심도 끔, 2: 해상도 배율 1, 3: 후처리 전부 끔. 낮아지기만 하고 새로고침 전까지 유지된다. */
export type QualityTier = 0 | 1 | 2 | 3;

export interface PerfStats {
  fps: number;
  drawCalls: number;
  triangles: number;
  dpr: number;
}

export interface SceneDebugFlags {
  showAnchors: boolean;
  showWaypoints: boolean;
  showLabels: boolean;
  detailColorMode: boolean;
  postEffects: boolean;
  aoMode: AoMode;
  showStats: boolean;
}

interface SceneState {
  cameraPreset: CameraPresetId;
  timeOfDay: TimeOfDayId;
  hoveredId: string | null;
  highlightedIds: readonly string[];
  debug: SceneDebugFlags;
  qualityTier: QualityTier;
  perf: PerfStats;
  setCameraPreset: (preset: CameraPresetId) => void;
  setTimeOfDay: (timeOfDay: TimeOfDayId) => void;
  setHoveredId: (id: string | null) => void;
  setHighlightedIds: (ids: readonly string[]) => void;
  setDebug: (flags: SceneDebugFlags) => void;
  setQualityTier: (tier: QualityTier) => void;
  setPerf: (perf: PerfStats) => void;
}

export const useSceneStore = create<SceneState>((set) => ({
  cameraPreset: 'overview',
  timeOfDay: DEFAULT_TIME_OF_DAY,
  hoveredId: null,
  highlightedIds: [],
  debug: { showAnchors: false, showWaypoints: false, showLabels: false, detailColorMode: false, postEffects: true, aoMode: 'auto', showStats: false },
  setCameraPreset: (cameraPreset) => set({ cameraPreset }),
  setTimeOfDay: (timeOfDay) => set({ timeOfDay }),
  setHoveredId: (hoveredId) => set({ hoveredId }),
  setHighlightedIds: (highlightedIds) => set({ highlightedIds }),
  setDebug: (debug) => set({ debug }),
  qualityTier: 0,
  perf: { fps: 0, drawCalls: 0, triangles: 0, dpr: 1 },
  setQualityTier: (qualityTier) => set({ qualityTier }),
  setPerf: (perf) => set({ perf }),
}));
