import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  BackSide,
  BufferAttribute,
  Color,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import { ARCHITECTURE } from '../../data/layout';
import { timeOfDayPresets, type TimeOfDayPreset } from '../../data/timeOfDay';
import { useSceneStore } from '../../state/sceneStore';
import { applyReflections, palette } from '../materials/palette';

const { target: SUN_TARGET } = ARCHITECTURE.sun;

/** 1을 넘는 색으로 회벽 위에서도 업라이트가 또렷하게 한다. */
const SUN_DISTANCE = 36;
const WASH_COLOR = [2.1, 1.9, 1.6] as const;

/** 실시간 반사 대신 하늘 그라데이션을 한 번만 구워 윤나는 재질에 나눠 준다. */
function buildSkyGradientScene(preset: TimeOfDayPreset) {
  const zenith = new Color(preset.reflectionZenith);
  const horizon = new Color(preset.reflectionHorizon);
  const ground = new Color(preset.reflectionGround);
  const geometry = new SphereGeometry(10, 24, 16);
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const color = new Color();
  for (let index = 0; index < position.count; index += 1) {
    const height = position.getY(index) / 10;
    if (height >= 0) color.lerpColors(horizon, zenith, height);
    else color.copy(ground);
    colors.set([color.r, color.g, color.b], index * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  const scene = new Scene();
  scene.add(new Mesh(geometry, new MeshBasicMaterial({ side: BackSide, vertexColors: true })));
  return scene;
}

/** 방향만 프리셋에서 받고 거리는 고정해, 해가 낮아도 그림자 범위가 건물 전체를 덮게 한다. */
function sunPosition(preset: TimeOfDayPreset) {
  return new Vector3(...preset.sunOffset).normalize().multiplyScalar(SUN_DISTANCE).add(new Vector3(...SUN_TARGET));
}

/** 그림자를 드리우는 태양 하나와 하늘·바닥 반사광. 펜던트는 발광 재질만 쓴다. 값은 시간대 프리셋에서 온다. */
export function Lighting() {
  const target = useMemo(() => new Object3D(), []);
  const gl = useThree((state) => state.gl);
  const preset = useSceneStore((state) => timeOfDayPresets[state.timeOfDay]);
  // 태양과 건물이 움직이지 않으므로 그림자는 배치가 바뀔 때만 다시 그린다.
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
  }, [gl, preset]);

  useEffect(() => {
    const generator = new PMREMGenerator(gl);
    const target = generator.fromScene(buildSkyGradientScene(preset));
    applyReflections(target.texture);
    generator.dispose();
    palette.lampGlow.emissiveIntensity = preset.lampGlow;
    palette.flame.emissiveIntensity = preset.flameGlow;
    palette.cloud.color.set(preset.cloudColor);
    palette.wallWash.color.setRGB(
      WASH_COLOR[0] * preset.warmLightGain,
      WASH_COLOR[1] * preset.warmLightGain,
      WASH_COLOR[2] * preset.warmLightGain,
    );
    palette.lightPool.color.setScalar(preset.warmLightGain);
    palette.sailcloth.emissiveIntensity = preset.sailGlow;
    return () => target.dispose();
  }, [gl, preset]);
  return (
    <>
      <hemisphereLight args={[preset.hemiSky, preset.hemiGround, preset.hemiIntensity]} />
      <primitive object={target} position={SUN_TARGET} />
      <directionalLight
        target={target}
        position={sunPosition(preset)}
        color={preset.sunColor}
        intensity={preset.sunIntensity}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-bias={-0.0002}
        shadow-normalBias={0.012}
      />
    </>
  );
}
