import { Leva, useControls } from 'leva';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { CAMERA_PRESET_IDS, type CameraPresetId } from './data/cameraPresets';
import { DEFAULT_TIME_OF_DAY, TIME_OF_DAY_IDS, type TimeOfDayId } from './data/timeOfDay';
import {
  BeachRestaurantScene,
  type SceneObjectRef,
  type UiSafeArea,
} from './scene/BeachRestaurantScene';
import { type AoMode, useSceneStore } from './state/sceneStore';

/** 더미 UI 박스의 크기. uiSafeArea 동작을 눈으로 확인하기 위한 값이다. */
const DUMMY_UI: UiSafeArea = { top: 64, right: 320, bottom: 96, left: 0 };

const layerStyle: CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none' };
const dummyBoxStyle: CSSProperties = {
  position: 'absolute',
  background: 'rgba(20, 40, 70, 0.35)',
  outline: '1px dashed rgba(255, 255, 255, 0.8)',
};
const logStyle: CSSProperties = {
  position: 'absolute',
  left: 12,
  bottom: 12,
  padding: '4px 8px',
  borderRadius: 4,
  font: '12px/1.4 ui-monospace, monospace',
  color: '#fff',
  background: 'rgba(20, 30, 45, 0.75)',
};

function isCameraPreset(value: string | null): value is CameraPresetId {
  return CAMERA_PRESET_IDS.some((id) => id === value);
}

function isTimeOfDay(value: string | null): value is TimeOfDayId {
  return TIME_OF_DAY_IDS.some((id) => id === value);
}

const params = new URLSearchParams(window.location.search);
const urlPreset = params.get('preset');
const urlTime = params.get('time');
/** 최종 스크린샷용: 개발 패널과 로그를 숨긴다. */
const isClean = params.has('clean');

/** 개발용 페이지. 나중의 게임 UI는 오버레이 레이어에 들어간다. */
export function App() {
  const setDebug = useSceneStore((state) => state.setDebug);
  const hoveredId = useSceneStore((state) => state.hoveredId);
  const perf = useSceneStore((state) => state.perf);
  const qualityTier = useSceneStore((state) => state.qualityTier);
  const [lastClick, setLastClick] = useState<SceneObjectRef | null>(null);

  const controls = useControls({
    cameraPreset: {
      label: '카메라',
      options: [...CAMERA_PRESET_IDS],
      value: isCameraPreset(urlPreset) ? urlPreset : 'overview',
    },
    timeOfDay: {
      label: '시간대',
      options: [...TIME_OF_DAY_IDS],
      value: isTimeOfDay(urlTime) ? urlTime : DEFAULT_TIME_OF_DAY,
    },
    showAnchors: { label: '앵커', value: params.has('anchors') },
    showWaypoints: { label: '웨이포인트', value: params.has('waypoints') },
    showLabels: { label: 'ID 라벨', value: params.has('labels') },
    detailColorMode: { label: '디테일 색상', value: params.has('detail') },
    postEffects: { label: '후처리', value: !params.has('nofx') },
    aoMode: {
      label: 'AO',
      options: ['auto', 'on', 'off'],
      value: params.get('ao') ?? 'auto',
    },
    showStats: { label: '성능 표시', value: params.has('stats') },
    showDummyUi: { label: '더미 UI', value: params.has('dummyUi') },
    highlight: { label: '하이라이트 id', value: params.get('highlight') ?? '' },
  });

  const { detailColorMode, highlight, postEffects, showAnchors, showDummyUi, showLabels, showStats, showWaypoints } = controls;
  const aoMode = controls.aoMode as AoMode;

  useEffect(() => {
    setDebug({ showAnchors, showWaypoints, showLabels, detailColorMode, postEffects, aoMode, showStats });
  }, [setDebug, showAnchors, showWaypoints, showLabels, detailColorMode, postEffects, aoMode, showStats]);

  const highlightedIds = useMemo(
    () => highlight.split(',').map((id) => id.trim()).filter(Boolean),
    [highlight],
  );

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <BeachRestaurantScene
        cameraPreset={controls.cameraPreset as CameraPresetId}
        timeOfDay={controls.timeOfDay as TimeOfDayId}
        highlightedIds={highlightedIds}
        onObjectClick={setLastClick}
        uiSafeArea={showDummyUi ? DUMMY_UI : undefined}
      />
      <div style={layerStyle} data-testid="ui-overlay">
        {showDummyUi && (
          <>
            <div style={{ ...dummyBoxStyle, top: 0, left: 0, right: 0, height: DUMMY_UI.top }} />
            <div style={{ ...dummyBoxStyle, top: DUMMY_UI.top, right: 0, bottom: DUMMY_UI.bottom, width: DUMMY_UI.right }} />
            <div style={{ ...dummyBoxStyle, left: 0, right: 0, bottom: 0, height: DUMMY_UI.bottom }} />
          </>
        )}
        {showStats && !isClean && (
          <div style={{ ...logStyle, bottom: 44 }} data-testid="perf-stats">
            {perf.fps.toFixed(0)} fps · {perf.drawCalls} draw calls · {Math.round(perf.triangles / 1000)}k tris · dpr{' '}
            {perf.dpr} · tier {qualityTier}
          </div>
        )}
        {!isClean && <div style={logStyle} data-testid="event-log">
          click: {lastClick ? `${lastClick.kind} / ${lastClick.id}` : '-'} · hover: {hoveredId ?? '-'}
        </div>}
      </div>
      <Leva collapsed={false} hidden={isClean} />
    </div>
  );
}
