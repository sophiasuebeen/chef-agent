import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useSceneStore } from '../../state/sceneStore';

const REPORT_SECONDS = 0.5;

/**
 * 성능 표시가 켜져 있을 때 프레임 전체의 draw call을 잰다.
 * 후처리가 render를 여러 번 부르므로 자동 초기화를 끄고 프레임마다 직접 초기화한다.
 */
export function PerfProbe() {
  const gl = useThree((state) => state.gl);
  const showStats = useSceneStore((state) => state.debug.showStats);
  const elapsed = useRef(0);
  const frames = useRef(0);

  useEffect(() => {
    if (!showStats) return;
    gl.info.autoReset = false;
    gl.info.reset();
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl, showStats]);

  useFrame((_, delta) => {
    if (!showStats) return;
    elapsed.current += delta;
    frames.current += 1;
    if (elapsed.current >= REPORT_SECONDS) {
      useSceneStore.getState().setPerf({
        fps: frames.current / elapsed.current,
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        dpr: gl.getPixelRatio(),
      });
      elapsed.current = 0;
      frames.current = 0;
    }
    gl.info.reset();
  });

  return null;
}
