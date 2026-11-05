import type { Vec3 } from './layout';

export const TIME_OF_DAY_IDS = ['golden', 'noon', 'dusk', 'night'] as const;
export const DEFAULT_TIME_OF_DAY = 'golden';
export type TimeOfDayId = (typeof TIME_OF_DAY_IDS)[number];

export interface TimeOfDayPreset {
  /** 그림자 중심에서 본 태양 위치. 방향만 의미가 있다. */
  sunOffset: Vec3;
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  skyZenith: string;
  skyHorizon: string;
  seaDeep: string;
  seaShallow: string;
  /** 바다 근해색을 얼마나 섞을지. */
  shallowMix: number;
  /** 수면이 하늘을 반사하는 최대 비율. 낮을수록 낮은 시점에서도 바다 색이 남는다. */
  seaReflection: number;
  cloudColor: string;
  lampGlow: number;
  flameGlow: number;
  reflectionZenith: string;
  reflectionHorizon: string;
  reflectionGround: string;
  /** 기둥과 벽의 업라이트, 바닥의 빛 웅덩이를 켠다. */
  showWarmLights: boolean;
  warmLightGain: number;
  /** 차양 돛이 빛을 머금는 정도. 밤에 높으면 돛만 떠 보인다. */
  sailGlow: number;
  /** 수면의 태양(또는 달) 반짝임 세기와 색. */
  glitter: number;
  glitterColor: string;
  /** 0이면 별과 달을 그리지 않는다. 달은 sunOffset 방향에 뜬다. */
  starAmount: number;
  moonAmount: number;
}

export const timeOfDayPresets: Record<TimeOfDayId, TimeOfDayPreset> = {
  // 기본값. 낮은 해가 아치로 들어와 긴 그림자를 만들고, 그늘은 깊게 둔다.
  golden: {
    sunOffset: [-13, 8, 15],
    sunColor: '#ffc792',
    sunIntensity: 3.3,
    hemiSky: '#e8e6e0',
    hemiGround: '#e6d0b2',
    hemiIntensity: 1.7,
    skyZenith: '#5f93c8',
    skyHorizon: '#dfcdb9',
    seaDeep: '#23587a',
    seaShallow: '#4f8797',
    shallowMix: 0.45,
    seaReflection: 0.42,
    cloudColor: '#fff0df',
    lampGlow: 0.45,
    flameGlow: 3.2,
    reflectionZenith: '#a9c3da',
    reflectionHorizon: '#f6e3cd',
    reflectionGround: '#c9ab88',
    showWarmLights: false,
    warmLightGain: 0,
    sailGlow: 0.2,
    glitter: 1.6,
    glitterColor: '#ffd2a0',
    starAmount: 0,
    moonAmount: 0,
  },
  noon: {
    sunOffset: [-9, 22, 8],
    sunColor: '#fff3e0',
    sunIntensity: 2.7,
    hemiSky: '#e8f3ff',
    hemiGround: '#f1e6d4',
    hemiIntensity: 2.2,
    skyZenith: '#4f97d6',
    skyHorizon: '#d9e9f2',
    seaDeep: '#1c5f8a',
    seaShallow: '#3e93a8',
    shallowMix: 0.8,
    seaReflection: 0.75,
    cloudColor: '#ffffff',
    lampGlow: 0.75,
    flameGlow: 3.2,
    reflectionZenith: '#9cc7ea',
    reflectionHorizon: '#eef4f6',
    reflectionGround: '#efe6d6',
    showWarmLights: false,
    warmLightGain: 0,
    sailGlow: 0.28,
    glitter: 1.4,
    glitterColor: '#fff5e0',
    starAmount: 0,
    moonAmount: 0,
  },
  // 하늘과 바다는 푸른 저녁, 실내는 따뜻한 불빛. 반구광이 건물에만 닿으므로 따뜻하게 잡아도 하늘은 푸르다.
  dusk: {
    sunOffset: [-20, 8, 16],
    sunColor: '#ffb27a',
    sunIntensity: 0.4,
    hemiSky: '#ffe8d0',
    hemiGround: '#bda58c',
    hemiIntensity: 1.3,
    skyZenith: '#2f5a8f',
    skyHorizon: '#b8c3cf',
    seaDeep: '#1c4468',
    seaShallow: '#34688a',
    shallowMix: 0.45,
    seaReflection: 0.6,
    cloudColor: '#c8cfdd',
    lampGlow: 1.5,
    flameGlow: 7,
    reflectionZenith: '#4d76a8',
    reflectionHorizon: '#c9c4bf',
    reflectionGround: '#8a6a4f',
    showWarmLights: true,
    warmLightGain: 1,
    sailGlow: 0.14,
    glitter: 0.9,
    glitterColor: '#ffc998',
    starAmount: 0,
    moonAmount: 0,
  },
  // 하늘과 바다는 거의 검고, 실내 불빛이 장면을 이끈다. 달빛은 수면에만 보일 정도로 약하다.
  night: {
    sunOffset: [7, 10, 24],
    sunColor: '#9db8e6',
    sunIntensity: 0.22,
    hemiSky: '#ffd2a3',
    hemiGround: '#7d5d44',
    hemiIntensity: 0.62,
    skyZenith: '#060c1e',
    skyHorizon: '#1a2841',
    seaDeep: '#040b18',
    seaShallow: '#0c2436',
    shallowMix: 0.35,
    seaReflection: 0.6,
    cloudColor: '#2a3550',
    lampGlow: 2.6,
    flameGlow: 10,
    reflectionZenith: '#141f38',
    reflectionHorizon: '#3a3a44',
    reflectionGround: '#5e3f2a',
    showWarmLights: true,
    warmLightGain: 1.45,
    sailGlow: 0.03,
    glitter: 0.7,
    glitterColor: '#c5d6f5',
    starAmount: 1,
    moonAmount: 1,
  },
};
