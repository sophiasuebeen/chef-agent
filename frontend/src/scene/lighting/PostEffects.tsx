import {
  Bloom,
  BrightnessContrast,
  DepthOfField,
  EffectComposer,
  HueSaturation,
  N8AO,
  Noise,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import { cameraPresets } from '../../data/cameraPresets';
import { useSceneStore } from '../../state/sceneStore';

const DOF_FOCUS_RANGE = 11;
const DOF_BOKEH = 0.9;

/**
 * 약한 AO, 얕은 심도, 발광부 Bloom, ACES 톤매핑, 그리고 사진 같은 마감(색보정, 비네트, 그레인).
 * M2 1600×900 측정에서 MSAA 4x가 약 7ms를 써서 끄고, AO는 half-res로 돌린다.
 * AO는 세기를 0으로 두어도 패스 비용이 그대로라, 끌 때는 효과 자체를 뺀다.
 */
export function PostEffects() {
  const enabled = useSceneStore((state) => state.debug.postEffects);
  const composerActive = useSceneStore((state) => state.qualityTier < 3 || state.debug.aoMode === 'on');
  const aoActive = useSceneStore((state) => {
    if (state.debug.aoMode === 'on') return true;
    if (state.debug.aoMode === 'off') return false;
    return state.qualityTier === 0;
  });
  const focusDistance = useSceneStore((state) => cameraPresets[state.cameraPreset].focusDistance);
  if (!enabled || !composerActive) return null;

  const effects = [
    ...(aoActive
      ? [
          <N8AO
            key="ao"
            halfRes
            depthAwareUpsampling
            aoRadius={0.7}
            distanceFalloff={0.6}
            intensity={1.9}
            aoSamples={12}
            denoiseSamples={4}
            denoiseRadius={12}
          />,
        ]
      : []),
    ...(aoActive && focusDistance !== undefined
      ? [
          <DepthOfField
            key="dof"
            worldFocusDistance={focusDistance}
            worldFocusRange={DOF_FOCUS_RANGE}
            bokehScale={DOF_BOKEH}
          />,
        ]
      : []),
    <Bloom key="bloom" mipmapBlur levels={5} intensity={0.22} luminanceThreshold={1} luminanceSmoothing={0.2} />,
    <ToneMapping key="toneMapping" mode={ToneMappingMode.ACES_FILMIC} />,
    <HueSaturation key="saturation" saturation={-0.1} />,
    <BrightnessContrast key="contrast" contrast={0.07} />,
    <Vignette key="vignette" offset={0.32} darkness={0.42} />,
    <Noise key="grain" premultiply opacity={0.07} blendFunction={BlendFunction.SOFT_LIGHT} />,
  ];
  return <EffectComposer multisampling={0}>{effects}</EffectComposer>;
}
