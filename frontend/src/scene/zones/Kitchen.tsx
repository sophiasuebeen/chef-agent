import { ARCHITECTURE, KITCHEN, kitchenDecor, passRail, plates, plateSlots, stations } from '../../data/layout';
import { Interactable } from '../Interactable';
import { Asset, HitProxy, PlacedAssets } from '../props/Asset';
import { boxBetween, mergeStatic } from '../props/geometry';
import { StaticMesh } from './StaticMesh';

const { kitchen } = ARCHITECTURE;
const { ceilingHeight, counterHeight, wallThickness } = KITCHEN;
const OUTER_MIN_X = kitchen.minX - wallThickness;
const OUTER_MAX_X = kitchen.maxX + wallThickness;
const OUTER_MIN_Z = kitchen.minZ - wallThickness;

/** 벽을 천장 속으로 조금 밀어 넣어 이음매로 빛이 새지 않게 한다. */
const WALL_OVERLAP = 0.1;
/** 옆 벽은 홀 벽 뒤에서 끝난다. 같은 면이 겹치면 z-fighting이 생긴다. */
const SIDE_WALL_END_Z = -ARCHITECTURE.hall.kitchenWallThickness;

function buildShell() {
  return mergeStatic([
    boxBetween([OUTER_MIN_X, 0, OUTER_MIN_Z], [OUTER_MAX_X, ceilingHeight + WALL_OVERLAP, kitchen.minZ]),
    boxBetween([OUTER_MIN_X, 0, OUTER_MIN_Z], [kitchen.minX, ceilingHeight + WALL_OVERLAP, SIDE_WALL_END_Z]),
    boxBetween([kitchen.maxX, 0, OUTER_MIN_Z], [OUTER_MAX_X, ceilingHeight + WALL_OVERLAP, SIDE_WALL_END_Z]),
  ]);
}

const TILE_THICKNESS = 0.012;

/** 타일은 안쪽 면에만 붙인다. 바깥은 건물과 같은 회벽이다. */
function buildTileLining() {
  return mergeStatic([
    boxBetween(
      [kitchen.minX, 0, kitchen.minZ],
      [kitchen.maxX, ceilingHeight, kitchen.minZ + TILE_THICKNESS],
    ),
    boxBetween(
      [kitchen.minX, 0, kitchen.minZ],
      [kitchen.minX + TILE_THICKNESS, ceilingHeight, SIDE_WALL_END_Z],
    ),
    boxBetween(
      [kitchen.maxX - TILE_THICKNESS, 0, kitchen.minZ],
      [kitchen.maxX, ceilingHeight, SIDE_WALL_END_Z],
    ),
  ]);
}

function buildCeiling() {
  return boxBetween(
    [OUTER_MIN_X, ceilingHeight, OUTER_MIN_Z],
    [OUTER_MAX_X, ceilingHeight + 0.2, kitchen.maxZ],
  );
}

function buildFloor() {
  return boxBetween([OUTER_MIN_X, -0.02, OUTER_MIN_Z], [OUTER_MAX_X, 0, kitchen.maxZ]);
}

const boil = stations.find((station) => station.type === 'boil');
const sauce = stations.find((station) => station.type === 'sauce');
const pass = stations.find((station) => station.type === 'pass');
if (!boil || !sauce || !pass) throw new Error('Kitchen layout needs boil, sauce and pass stations');

/** ③④ 위의 후드: 아랫단과 천장까지 올라가는 굴뚝. */
function buildHood() {
  const minX = boil!.position[0] - boil!.size[0] / 2;
  const maxX = sauce!.position[0] + sauce!.size[0] / 2;
  const minZ = kitchen.minZ;
  const maxZ = boil!.position[2] + boil!.size[2] / 2;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  return mergeStatic([
    boxBetween([minX, 2.1, minZ], [maxX, 2.45, maxZ]),
    boxBetween([centerX - 0.7, 2.45, minZ], [centerX + 0.7, ceilingHeight, centerZ + 0.1]),
  ]);
}

/** 패스 상판은 스테이션을 살짝 덮는 오크판. 윗면은 카운터 높이에 맞춘다. */
function buildPassTop() {
  const [x, , z] = pass!.position;
  const [width, , depth] = pass!.size;
  return boxBetween(
    [x - width / 2 - 0.02, counterHeight - 0.04, z - depth / 2],
    [x + width / 2 + 0.02, counterHeight + 0.001, z + depth / 2 + 0.03],
  );
}

const stationIds = new Set(stations.map((station) => station.id));
const stationPlates = plateSlots.filter((slot) => stationIds.has(slot.ownerId));
const stationPlateIds = new Set(stationPlates.map((slot) => `${slot.id}.plate`));
const kitchenPlacements = [...plates.filter((plate) => stationPlateIds.has(plate.id)), ...kitchenDecor];

export function Kitchen() {
  return (
    <group name="zone.kitchen">
      <StaticMesh build={buildFloor} material="kitchenFloor" castShadow={false} />
      <StaticMesh build={buildShell} material="plaster" />
      <StaticMesh build={buildTileLining} material="kitchenTile" castShadow={false} />
      <StaticMesh build={buildCeiling} material="plaster" blocksPointer={false} cutaway />
      <StaticMesh build={buildHood} material="plaster" />

      {stations.map((station) => (
        <Interactable key={station.id} kind="station" id={station.id} position={station.position}>
          <Asset id="station.counter" size={station.size} />
        </Interactable>
      ))}
      <StaticMesh build={buildPassTop} material="oak" blocksPointer={false} />

      <Interactable kind="passRail" id={passRail.id} position={passRail.position}>
        <Asset id="rail.pass" size={passRail.size} />
      </Interactable>
      {stationPlates.map((slot) => (
        <Interactable key={slot.id} kind="plateSlot" id={slot.id} position={slot.position}>
          <HitProxy assetId="plate.dinner" />
        </Interactable>
      ))}
      <PlacedAssets placements={kitchenPlacements} />
    </group>
  );
}
