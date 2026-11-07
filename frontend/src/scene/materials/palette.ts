import { AdditiveBlending, Color, DoubleSide, type Material, MeshBasicMaterial, MeshStandardMaterial, type Texture, Vector2 } from 'three';
import { photoTextures } from './photoTextures';
import type { DetailTier } from '../../assets/registry';
import {
  caneColor,
  kitchenTileColor,
  lightPoolTexture,
  limestoneBump,
  limestoneColor,
  marbleColor,
  paintedPlateColor,
  plasterColor,
  wallArtColor,
  pillowStripeBump,
  pillowStripeColor,
  sandColor,
  terracottaColor,
  wallWashTexture,
} from './textures';

function standard(color: string, roughness = 0.8, metalness = 0) {
  return new MeshStandardMaterial({ color, roughness, metalness });
}

/** 소품이 공유하는 재질. 5단계에서 절차적 텍스처가 여기에 붙는다. */
export const palette = {
  linen: new MeshStandardMaterial({ color: '#f1eadd', roughness: 0.95, normalMap: photoTextures.linenNormal, normalScale: new Vector2(0.45, 0.45) }),
  fabric: new MeshStandardMaterial({ color: '#ddd3c1', roughness: 1, normalMap: photoTextures.boucleNormal, normalScale: new Vector2(0.75, 0.75) }),
  walnut: new MeshStandardMaterial({ color: '#9b8a7a', roughness: 0.5, map: photoTextures.walnutColor }),
  plaster: new MeshStandardMaterial({ color: '#f3ecdf', roughness: 0.92, map: plasterColor, normalMap: photoTextures.plasterNormal, normalScale: new Vector2(0.7, 0.7) }),
  marbleFloor: new MeshStandardMaterial({ color: '#ebe6dc', roughnessMap: photoTextures.floorRough, roughness: 0.8, map: photoTextures.floorColor, normalMap: photoTextures.floorNormal, normalScale: new Vector2(0.6, 0.6) }),
  limestone: new MeshStandardMaterial({ color: '#e8dfce', roughness: 0.72, map: limestoneColor, bumpMap: limestoneBump, bumpScale: 0.8 }),
  kitchenFloor: new MeshStandardMaterial({ color: '#d5d1c7', roughness: 0.8, map: limestoneColor, bumpMap: limestoneBump, bumpScale: 0.8 }),
  kitchenTile: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, map: kitchenTileColor }),
  frameSteel: standard('#8f8676', 0.5, 0.3),
  frameSteelDark: standard('#5d574d', 0.45, 0.4),
  skylightGlass: new MeshStandardMaterial({
    color: '#bcd9ec',
    roughness: 0.06,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    side: DoubleSide,
  }),
  ground: new MeshStandardMaterial({ color: '#d9cfb6', roughness: 1, map: sandColor }),
  rock: new MeshStandardMaterial({ color: '#b8a784', roughness: 1, map: sandColor }),
  sand: new MeshStandardMaterial({ color: '#f1e5c8', roughness: 1, map: sandColor }),
  terracotta: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, map: terracottaColor }),
  ceramic: standard('#fbfaf6', 0.35),
  blueGlaze: standard('#2f6fb2', 0.3),
  soil: standard('#cdb78f', 1),
  bark: standard('#7a5a3f', 0.95),
  leaf: standard('#66734c', 0.8),
  oliveLeaf: new MeshStandardMaterial({ color: '#68755a', roughness: 0.7, side: DoubleSide }),
  oliveLeafPale: new MeshStandardMaterial({ color: '#919b83', roughness: 0.75, side: DoubleSide }),
  oliveBark: new MeshStandardMaterial({ color: new Color(2.4, 2.25, 2.0), roughness: 1, map: photoTextures.barkColor, normalMap: photoTextures.barkNormal }),
  darkSoil: standard('#54483b', 1),
  wallArt: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, map: wallArtColor }),
  paintedPlate: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, map: paintedPlateColor }),
  windowGlass: new MeshStandardMaterial({
    color: '#d5e6ef',
    roughness: 0.05,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    side: DoubleSide,
  }),
  wallWash: new MeshBasicMaterial({
    map: wallWashTexture,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    fog: false,
  }),
  lightPool: new MeshBasicMaterial({
    map: lightPoolTexture,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    fog: false,
  }),
  driedStem: standard('#c9b48a', 0.9),
  cord: standard('#e8e4da', 0.8),
  brass: standard('#b0935f', 0.45, 0.5),
  oilGlass: standard('#55702c', 0.2),
  cork: standard('#b58d5f', 0.9),
  wicker: standard('#b98f55', 0.9),
  bread: standard('#d9a964', 0.85),
  lemon: standard('#dcc05e', 0.55),
  pasta: standard('#ecc765', 0.65),
  figSkin: standard('#68365b', 0.65),
  figFlesh: standard('#c96b80', 0.65),
  cheese: standard('#f1e1af', 0.8),
  tomatoSauce: standard('#b93a24', 0.45),
  shrimp: standard('#e8906f', 0.5),
  mussel: standard('#2c2f3a', 0.35),
  napkin: standard('#cfe0ee', 0.95),
  marble: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.2, map: marbleColor }),
  oak: new MeshStandardMaterial({ color: '#e7d7c0', roughness: 0.6, map: photoTextures.oakColor }),
  // 가는 세로 부재는 박스 투영의 결이 가로로 누워 줄무늬처럼 보이므로 민무늬로 둔다.
  oakFrame: new MeshStandardMaterial({ color: '#d6cabb', roughness: 0.55, map: photoTextures.oakColor }),
  cane: new MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.85,
    map: caneColor,
    alphaTest: 0.3,
    side: DoubleSide,
  }),
  rattan: standard('#d6c08f', 0.95),
  steel: standard('#c9ced2', 0.25, 0.85),
  wineBottle: standard('#26402a', 0.25),
  flowerBlue: standard('#4d7fc4', 0.7),
  sofaFabric: new MeshStandardMaterial({ color: '#c9bfac', roughness: 1, normalMap: photoTextures.boucleNormal, normalScale: new Vector2(0.9, 0.9) }),
  pillowBlue: new MeshStandardMaterial({ color: '#748a9e', roughness: 1, normalMap: photoTextures.linenNormal }),
  pillowSky: new MeshStandardMaterial({ color: '#aab8c2', roughness: 1, normalMap: photoTextures.linenNormal }),
  pillowStripe: new MeshStandardMaterial({ color: '#ffffff', roughness: 1, map: pillowStripeColor, bumpMap: pillowStripeBump, bumpScale: 2.2 }),
  terracottaWhite: standard('#e9e0d0', 0.85),
  bougainvillea: standard('#a8566f', 0.85),
  shrub: standard('#6c7a55', 0.95),
  island: standard('#a6bcc6', 1),
  // 천을 통과하는 빛을 흉내 내 그늘진 아랫면이 어두워지지 않게 한다.
  sailcloth: new MeshStandardMaterial({
    color: '#efe7d8',
    roughness: 0.9,
    side: DoubleSide,
    emissive: '#fff6e6',
    emissiveIntensity: 0.28,
  }),
  cloud: new MeshBasicMaterial({ color: '#ffffff', fog: false }),
  wineGlass: new MeshStandardMaterial({
    color: '#c4dde6',
    roughness: 0.05,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  }),
  curtain: new MeshStandardMaterial({
    color: '#f6efe3',
    roughness: 0.95,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
    side: DoubleSide,
    vertexColors: true,
  }),
  lampGlow: new MeshStandardMaterial({
    color: '#ece3d3',
    roughness: 0.7,
    emissive: '#ffe9c8',
    emissiveIntensity: 0.75,
  }),
  flame: new MeshStandardMaterial({
    color: '#ffd27a',
    emissive: '#ffb347',
    emissiveIntensity: 3.2,
  }),
} satisfies Record<string, Material>;

export type MaterialKey = keyof typeof palette;

/** 윤이 나는 재질만 하늘 반사를 받는다. 전체에 걸면 픽셀 비용과 밝기가 함께 오른다. */
const REFLECTIVE: [MaterialKey, number][] = [
  ['marbleFloor', 0.22],
  ['skylightGlass', 1.2],
  ['windowGlass', 0.35],
  ['paintedPlate', 0.4],
  ['frameSteel', 0.5],
  ['frameSteelDark', 0.5],
  ['marble', 0.5],
  ['ceramic', 0.45],
  ['steel', 1],
  ['wineGlass', 1],
  ['oilGlass', 0.7],
];

export function applyReflections(environment: Texture) {
  for (const [key, intensity] of REFLECTIVE) {
    const material = palette[key];
    if (!(material instanceof MeshStandardMaterial)) continue;
    material.envMap = environment;
    material.envMapIntensity = intensity;
    material.needsUpdate = true;
  }
}

const tierMaterials: Record<DetailTier, MeshStandardMaterial> = {
  interactive: standard('#e8833a'),
  background: standard('#a9bdd2'),
  far: standard('#e0dbd2'),
};

/** 디테일 색상 모드를 켰을 때 소품이 쓰는 단색 재질. */
export function detailMaterial(tier: DetailTier): MeshStandardMaterial {
  return tierMaterials[tier];
}
