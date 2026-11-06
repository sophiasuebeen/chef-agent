import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import { useSceneStore } from '../../state/sceneStore';

const TARGET_FPS = 50;
const WINDOW_SECONDS = 2;
const LOW_WINDOWS_TO_DOWNGRADE = 3;
/** 시작과 품질 변경 직후는 셰이더 컴파일로 프레임이 튀므로 재지 않는다. */
const SETTLE_SECONDS = 6;
/** 탭이 가려져 있다 돌아온 프레임은 성능과 무관하므로 버린다. */
const MAX_FRAME_SECONDS = 0.5;

/**
 * fps가 목표 아래로 계속 머물면 품질을 한 단계씩 낮춘다: AO·심도 → 해상도 배율 → 후처리 전부.
 * 색보정과 비네트가 분위기를 좌우하므로 후처리는 마지막에 끈다.
 * 다시 올리지 않는다. 올렸다 내렸다 하면 화면이 깜빡이고 프레임이 더 튄다.
 */
export function PerformanceGovernor() {
  const setDpr = useThree((state) => state.setDpr);
  const settle = useRef(SETTLE_SECONDS);
  const elapsed = useRef(0);
  const frames = useRef(0);
  const lowWindows = useRef(0);

  useFrame((_, delta) => {
    if (delta > MAX_FRAME_SECONDS) return;
    const { qualityTier, setQualityTier } = useSceneStore.getState();
    if (qualityTier >= 3) return;
    if (settle.current > 0) {
      settle.current -= delta;
      return;
    }
    elapsed.current += delta;
    frames.current += 1;
    if (elapsed.current < WINDOW_SECONDS) return;

    const fps = frames.current / elapsed.current;
    elapsed.current = 0;
    frames.current = 0;
    lowWindows.current = fps < TARGET_FPS ? lowWindows.current + 1 : 0;
    if (lowWindows.current < LOW_WINDOWS_TO_DOWNGRADE) return;

    lowWindows.current = 0;
    settle.current = SETTLE_SECONDS;
    if (qualityTier === 1) setDpr(1);
    setQualityTier(qualityTier === 0 ? 1 : qualityTier === 1 ? 2 : 3);
  });

  return null;
}
