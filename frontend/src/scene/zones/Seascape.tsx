import { useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo } from 'react';
import {
  BackSide,
  Color,
  DataTexture,
  ExtrudeGeometry,
  Fog,
  LinearFilter,
  RedFormat,
  RepeatWrapping,
  Shape,
  ShaderMaterial,
  Vector3,
} from 'three';
import { ARCHITECTURE, seascapeDecor } from '../../data/layout';
import { timeOfDayPresets } from '../../data/timeOfDay';
import { useSceneStore } from '../../state/sceneStore';
import { PlacedAssets } from '../props/Asset';
import { seededRandom } from '../props/geometry';
import { StaticMesh } from './StaticMesh';

const { land, sea } = ARCHITECTURE;

const SEA_SIZE = 6000;
const SKY_RADIUS = 3000;
const FOG_NEAR = 450;
const FOG_FAR = 2400;
const NOISE_SIZE = 128;


/** x를 양쪽으로 샘플링한 해안선. 테라스 앞은 평평하고 곶 바깥으로 갈수록 물러난다. */
const COAST_SAMPLES_X = [1500, 700, 300, 150, 90, 60, 42, 30, 22, 17, 14, land.flatHalfWidth];

function coastZ(x: number, zOffset: number) {
  const beyond = Math.max(0, Math.abs(x) - land.flatHalfWidth);
  return land.frontZ + zOffset - land.recede * (1 - Math.exp(-beyond / land.recedeScale));
}

/** 해안선 아래로 해수면 밑까지 내려가는 땅 한 층. */
function buildLandLayer(layer: { topY: number; zOffset: number }) {
  const shape = new Shape();
  shape.moveTo(-land.halfWidth, land.backZ);
  shape.lineTo(land.halfWidth, land.backZ);
  for (const x of COAST_SAMPLES_X) shape.lineTo(x, coastZ(x, layer.zOffset));
  for (const x of [...COAST_SAMPLES_X].reverse()) shape.lineTo(-x, coastZ(x, layer.zOffset));
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: layer.topY - sea.level + 1, bevelEnabled: false });
  // 도형의 y를 월드 z로, 돌출 방향을 월드 -y로 돌린다.
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, layer.topY, 0);
  return geometry;
}

const buildGround = () => buildLandLayer(land.layers.ground);
const buildShelf = () => buildLandLayer(land.layers.shrubShelf);
const buildBeach = () => buildLandLayer(land.layers.beach);

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 horizon;
  uniform vec3 zenith;
  uniform vec3 moonDirection;
  uniform float starAmount;
  uniform float moonAmount;
  varying vec3 vDirection;

  float starField(vec3 direction) {
    vec3 scaled = direction * 170.0;
    vec3 cell = floor(scaled);
    float seed = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float dot_ = smoothstep(0.42, 0.05, length(fract(scaled) - 0.5));
    return step(0.994, seed) * dot_ * (0.5 + 0.5 * fract(seed * 91.7));
  }

  void main() {
    vec3 direction = normalize(vDirection);
    float height = clamp(direction.y, 0.0, 1.0);
    vec3 color = mix(horizon, zenith, pow(height, 0.42));
    if (starAmount > 0.0) {
      color += vec3(1.4, 1.45, 1.6) * starField(direction) * starAmount * smoothstep(0.02, 0.25, direction.y);
    }
    if (moonAmount > 0.0) {
      float facing = dot(direction, moonDirection);
      color += vec3(2.4, 2.3, 2.05) * smoothstep(0.99975, 0.9999, facing) * moonAmount;
      color += vec3(0.1, 0.13, 0.2) * pow(max(facing, 0.0), 300.0) * moonAmount;
    }
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const SEA_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/** 하늘 그라데이션을 반사하는 저비용 수면. 장면을 다시 그리지 않아 draw call이 늘지 않는다. */
const SEA_FRAGMENT = /* glsl */ `
  uniform float time;
  uniform sampler2D noiseMap;
  uniform vec3 sunDirection;
  uniform vec3 horizon;
  uniform vec3 zenith;
  uniform vec3 deepColor;
  uniform vec3 shallowColor;
  uniform float shallowMix;
  uniform float seaReflection;
  uniform float glitter;
  uniform vec3 glitterColor;
  uniform float fogNear;
  uniform float fogFar;
  varying vec3 vWorld;

  float noise(vec2 p) {
    return texture2D(noiseMap, p / 128.0).r;
  }
  float waves(vec2 p) {
    float h = 0.0;
    h += 0.60 * noise(p * 0.13 + vec2(time * 0.10, time * 0.05));
    h += 0.28 * noise(p * 0.37 - vec2(time * 0.16, -time * 0.09));
    h += 0.12 * noise(p * 0.97 + vec2(-time * 0.25, time * 0.21));
    return h;
  }
  vec3 skyColor(vec3 dir) {
    return mix(horizon, zenith, pow(clamp(dir.y, 0.0, 1.0), 0.42));
  }

  void main() {
    vec3 toCamera = cameraPosition - vWorld;
    float dist = length(toCamera);
    vec3 view = toCamera / dist;

    // 멀수록 파도를 약하게 해 수평선의 모아레를 막는다.
    float strength = 0.55 * exp(-dist / 220.0) + 0.05;
    float e = 0.35 + dist * 0.004;
    float h = waves(vWorld.xz);
    vec3 normal = normalize(vec3(
      (h - waves(vWorld.xz + vec2(e, 0.0))) / e * strength,
      1.0,
      (h - waves(vWorld.xz + vec2(0.0, e))) / e * strength
    ));

    float cosView = clamp(dot(view, normal), 0.0, 1.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - cosView, 5.0);
    vec3 reflected = reflect(-view, normal);
    reflected.y = abs(reflected.y);

    float nearShore = 1.0 - smoothstep(25.0, 110.0, vWorld.z);
    vec3 water = mix(deepColor, shallowColor, nearShore * shallowMix + 0.15 * (h - 0.5));
    vec3 color = mix(water, skyColor(reflected), min(fresnel, seaReflection));

    float sparkle = pow(max(dot(reflected, sunDirection), 0.0), 260.0);
    color += glitterColor * sparkle * glitter;

    color = mix(color, horizon, smoothstep(fogNear, fogFar, dist));
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** 셰이더 안에서 해시를 계산하는 대신 미리 만든 노이즈를 읽어 픽셀당 비용을 줄인다. */
function createNoiseTexture() {
  const random = seededRandom(9001);
  const data = new Uint8Array(NOISE_SIZE * NOISE_SIZE);
  for (let index = 0; index < data.length; index += 1) data[index] = random() * 255;
  const texture = new DataTexture(data, NOISE_SIZE, NOISE_SIZE, RedFormat);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function useTimeOfDay() {
  return useSceneStore((state) => timeOfDayPresets[state.timeOfDay]);
}

function setColorUniform(material: ShaderMaterial, name: string, color: string) {
  const uniform = material.uniforms[name];
  if (uniform) uniform.value = new Color(color);
}

function Sky() {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          horizon: { value: new Color() },
          zenith: { value: new Color() },
          moonDirection: { value: new Vector3() },
          starAmount: { value: 0 },
          moonAmount: { value: 0 },
        },
      }),
    [],
  );
  const preset = useTimeOfDay();
  useLayoutEffect(() => {
    setColorUniform(material, 'horizon', preset.skyHorizon);
    setColorUniform(material, 'zenith', preset.skyZenith);
    const { moonAmount, moonDirection, starAmount } = material.uniforms;
    if (moonDirection) moonDirection.value = new Vector3(...preset.sunOffset).normalize();
    if (starAmount) starAmount.value = preset.starAmount;
    if (moonAmount) moonAmount.value = preset.moonAmount;
  }, [material, preset]);
  return (
    <mesh material={material} renderOrder={-1} raycast={() => null}>
      <sphereGeometry args={[SKY_RADIUS, 24, 16]} />
    </mesh>
  );
}

function Sea() {
  const detailMode = useSceneStore((state) => state.debug.detailColorMode);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: SEA_VERTEX,
        fragmentShader: SEA_FRAGMENT,
        uniforms: {
          time: { value: 0 },
          noiseMap: { value: createNoiseTexture() },
          sunDirection: { value: new Vector3() },
          horizon: { value: new Color() },
          zenith: { value: new Color() },
          deepColor: { value: new Color() },
          shallowColor: { value: new Color() },
          shallowMix: { value: 0 },
          seaReflection: { value: 0 },
          glitter: { value: 0 },
          glitterColor: { value: new Color() },
          fogNear: { value: FOG_NEAR },
          fogFar: { value: FOG_FAR },
        },
      }),
    [],
  );
  const preset = useTimeOfDay();
  useLayoutEffect(() => {
    setColorUniform(material, 'horizon', preset.skyHorizon);
    setColorUniform(material, 'zenith', preset.skyZenith);
    setColorUniform(material, 'deepColor', preset.seaDeep);
    setColorUniform(material, 'shallowColor', preset.seaShallow);
    setColorUniform(material, 'glitterColor', preset.glitterColor);
    const { glitter, seaReflection, shallowMix, sunDirection } = material.uniforms;
    if (seaReflection) seaReflection.value = preset.seaReflection;
    if (shallowMix) shallowMix.value = preset.shallowMix;
    if (glitter) glitter.value = preset.glitter;
    if (sunDirection) sunDirection.value = new Vector3(...preset.sunOffset).normalize();
  }, [material, preset]);
  useFrame((_, delta) => {
    const time = material.uniforms.time;
    if (time) time.value += delta;
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, sea.level, 0]} raycast={() => null}>
      <planeGeometry args={[SEA_SIZE, SEA_SIZE]} />
      {detailMode ? <meshBasicMaterial color="#e0dbd2" /> : <primitive object={material} attach="material" />}
    </mesh>
  );
}

/** 바다, 하늘, 해안, 원경. */
export function Seascape() {
  const scene = useThree((state) => state.scene);
  const preset = useTimeOfDay();
  // 안개는 장면 루트의 속성이라 이 그룹의 자식으로 붙일 수 없다.
  useLayoutEffect(() => {
    scene.fog = new Fog(preset.skyHorizon, FOG_NEAR, FOG_FAR);
    return () => {
      scene.fog = null;
    };
  }, [scene, preset]);

  return (
    <group name="zone.seascape">
      <Sky />
      <Sea />
      <StaticMesh build={buildGround} material="ground" tier="far" castShadow={false} />
      <StaticMesh build={buildShelf} material="rock" tier="far" castShadow={false} />
      <StaticMesh build={buildBeach} material="sand" tier="far" castShadow={false} />
      <PlacedAssets placements={seascapeDecor} />
    </group>
  );
}
