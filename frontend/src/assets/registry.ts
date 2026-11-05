import { type BufferGeometry, MeshStandardMaterial } from 'three';
import type { ComponentType } from 'react';
import type { Vec3 } from '../data/layout';
import { type MaterialKey, palette } from '../scene/materials/palette';
import { boxProjectUVs } from '../scene/props/geometry';
import { herbPotParts } from '../scene/props/KitchenDecor';
import { banquetteSeatParts, fabricChairParts, oakChairParts } from '../scene/props/Chair';
import { banquetteSegmentParts, cushionBlueParts, cushionSkyParts, cushionStripeParts } from '../scene/props/Banquette';
import {
  bluePlateParts,
  wallArtParts,
  curtainParts,
  floorBranchParts,
  nicheFlowerParts,
} from '../scene/props/HallDecor';
import { oliveTreeParts } from '../scene/props/OliveTree';
import { cloudParts, islandParts, shrubParts, yachtParts } from '../scene/props/Seascape';
import {
  bougainvilleaParts,
  flowerVaseParts,
  iceBucketParts,
  lemonTreeParts,
  shadeSailParts,
} from '../scene/props/TerraceDecor';
import { lightPoolParts, pendantParts, standingLampParts, wallWashParts } from '../scene/props/Pendant';
import { makePlaceholder } from '../scene/props/Placeholder';
import { dinnerPlateParts, pastaParts } from '../scene/props/PlateOfPasta';
import { marbleSlabParts, roundTableParts, squareTableParts } from '../scene/props/Table';
import {
  breadBasketParts,
  candleParts,
  lemonVaseParts,
  napkinParts,
  oilBottleParts,
  wineGlassParts,
} from '../scene/props/TableSetting';

/** 디테일 단계: 조작 물건(주황) / 배경(하늘색) / 원경(베이지). */
export type DetailTier = 'interactive' | 'background' | 'far';

export interface AssetProps {
  /** 배치 데이터가 크기를 정하는 소품(스테이션 등)에만 전달된다. */
  size?: Vec3;
}

/** 재질 하나를 쓰는 지오메트리 덩어리. 소품은 재질 수만큼의 덩어리로 이루어진다. */
export interface AssetPart {
  material: MaterialKey;
  geometry: BufferGeometry;
  castShadow?: boolean;
}

/**
 * 소품 id → 렌더 방법.
 * - parts: 절차적 지오메트리. 같은 소품은 자동으로 InstancedMesh로 묶인다.
 * - component: 배치 데이터로 크기가 정해지는 일회성 형태.
 * - glb: `{ type: 'glb', url: '/assets/x.glb', fitHeight, tier, hitSize }`로 바꾸면 호출부 수정 없이 교체된다.
 *   모델은 높이 fitHeight(m)로 맞춰지고 바닥 중심이 원점이 된다. .gltf도 같은 항목으로 쓸 수 있다.
 * hitSize는 클릭 판정 상자의 폭·높이·깊이로, 원점에서 위로 쌓인다.
 */
export type AssetEntry = { tier: DetailTier; hitSize?: Vec3 } & (
  | { type: 'parts'; parts: AssetPart[] }
  | { type: 'component'; component: ComponentType<AssetProps> }
  | { type: 'glb'; url: string; fitHeight: number }
);

function parts(partList: AssetPart[], tier: DetailTier, hitSize?: Vec3): AssetEntry {
  const projected = partList.map((part) => {
    const material = palette[part.material];
    const isTextured =
      material instanceof MeshStandardMaterial
        ? Boolean(material.map ?? material.normalMap ?? material.bumpMap)
        : 'map' in material && Boolean(material.map);
    return isTextured ? { ...part, geometry: boxProjectUVs(part.geometry) } : part;
  });
  return { type: 'parts', parts: projected, tier, ...(hitSize ? { hitSize } : {}) };
}

function model(id: string, fitHeight: number, tier: DetailTier): AssetEntry {
  return { type: 'glb', url: `/assets/models/${id}/${id}.gltf`, fitHeight, tier };
}

function boxComponent(size: Vec3, color: string): AssetEntry {
  return {
    type: 'component',
    tier: 'interactive',
    component: makePlaceholder({ shape: 'box', size, color, tier: 'interactive' }),
  };
}

export const assetRegistry = {
  // 조작 물건
  'station.counter': boxComponent([1.6, 0.94, 0.8], '#eeeae2'),
  'rail.pass': boxComponent([3, 0.06, 0.06], '#d9822b'),
  'plate.dinner': parts(dinnerPlateParts, 'interactive', [0.27, 0.03, 0.27]),
  'table.square': parts(squareTableParts, 'interactive', [0.96, 0.75, 0.96]),
  'table.round': parts(roundTableParts, 'interactive', [1.06, 0.75, 1.06]),
  'table.terraceSlab': parts(marbleSlabParts, 'interactive', [1.3, 0.75, 0.8]),
  'seat.chair': parts(fabricChairParts, 'interactive', [0.58, 0.88, 0.56]),
  'seat.terraceChair': parts(oakChairParts, 'interactive', [0.54, 0.88, 0.54]),
  'seat.banquette': parts(banquetteSeatParts, 'interactive', [0.62, 0.5, 0.6]),

  // 테이블 세팅
  'food.pasta': parts(pastaParts, 'interactive'),
  'setting.napkin': parts(napkinParts, 'background'),
  'setting.wineGlass': parts(wineGlassParts, 'background'),
  'setting.oilBottle': parts(oilBottleParts, 'background'),
  'setting.breadBasket': parts(breadBasketParts, 'background'),
  'setting.candle': parts(candleParts, 'background'),
  'setting.lemonVase': parts(lemonVaseParts, 'background'),

  // 홀의 고정 소품
  'tree.olive': parts(oliveTreeParts, 'background'),
  'lamp.pendant': parts(pendantParts, 'background'),
  'lamp.standing': parts(standingLampParts, 'background'),
  'decor.curtain': parts(curtainParts, 'background'),
  'decor.bluePlate': parts(bluePlateParts, 'background'),
  'decor.floorVase': model('ceramic_vase_01', 1, 'background'),
  'decor.floorBranches': parts(floorBranchParts, 'background'),
  'decor.nicheVase': model('ceramic_vase_02', 0.32, 'background'),
  'decor.nicheFlowers': parts(nicheFlowerParts, 'background'),
  'decor.wallArt': parts(wallArtParts, 'background'),

  // 해질녘 불빛
  'light.wash': parts(wallWashParts, 'background'),
  'light.pool': parts(lightPoolParts, 'background'),

  // 테라스
  'setting.flowerVase': parts(flowerVaseParts, 'background'),
  'setting.iceBucket': parts(iceBucketParts, 'background'),
  'decor.banquetteSegment': parts(banquetteSegmentParts, 'background'),
  'cushion.blue': parts(cushionBlueParts, 'background'),
  'cushion.sky': parts(cushionSkyParts, 'background'),
  'cushion.stripe': parts(cushionStripeParts, 'background'),
  'decor.shadeSail': parts(shadeSailParts, 'background'),
  'decor.lemonTree': parts(lemonTreeParts, 'background'),
  'decor.bougainvillea': parts(bougainvilleaParts, 'background'),

  'decor.herbPot': parts(herbPotParts, 'background'),

  // 원경
  'decor.shrub': parts(shrubParts, 'far'),
  'decor.yacht': parts(yachtParts, 'far'),
  'decor.island': parts(islandParts, 'far'),
  'decor.cloud': parts(cloudParts, 'far'),
} as const satisfies Record<string, AssetEntry>;

export type AssetId = keyof typeof assetRegistry;

export function getAssetEntry(id: string): AssetEntry {
  const entry = (assetRegistry as Record<string, AssetEntry>)[id];
  if (!entry) throw new Error(`Unknown asset id: ${id}`);
  return entry;
}
