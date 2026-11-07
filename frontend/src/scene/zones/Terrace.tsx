import {
  ARCHITECTURE,
  plates,
  tables,
  terraceDecor,
  terraceTableSettings,
  terraceWarmLights,
} from '../../data/layout';
import { WarmLights } from '../props/WarmLights';
import { PlacedAssets } from '../props/Asset';
import { TableSet, tablePlacements } from '../props/TableSet';
import { boxBetween, mergeStatic } from '../props/geometry';
import { StaticMesh } from './StaticMesh';

const { terrace } = ARCHITECTURE;
const { banquette, railingHeight, railingThickness } = terrace;

function buildFloor() {
  return boxBetween([terrace.minX, -0.02, terrace.minZ], [terrace.maxX, 0, terrace.maxZ]);
}

const CAP_THICKNESS = 0.05;
const CAP_OVERHANG = 0.04;

function buildRailing() {
  return mergeStatic([
    boxBetween(
      [terrace.minX - CAP_OVERHANG, railingHeight, terrace.maxZ - railingThickness - CAP_OVERHANG],
      [terrace.maxX + CAP_OVERHANG, railingHeight + CAP_THICKNESS, terrace.maxZ + CAP_OVERHANG],
    ),
    boxBetween(
      [terrace.minX, 0, terrace.maxZ - railingThickness],
      [terrace.maxX, railingHeight, terrace.maxZ],
    ),
    boxBetween(
      [terrace.minX, 0, terrace.minZ],
      [terrace.minX + railingThickness, railingHeight, terrace.maxZ - railingThickness],
    ),
    boxBetween(
      [terrace.maxX - railingThickness, 0, terrace.minZ],
      [terrace.maxX, railingHeight, terrace.maxZ - railingThickness],
    ),
  ]);
}

/** 소파의 받침만 정적 지오메트리다. 방석과 등받이는 천 재질의 소품으로 얹는다. */
function buildBanquettePlinth() {
  const halfRun = (banquette.segmentLength * banquette.segmentCount) / 2;
  const backZ = terrace.maxZ - railingThickness;
  return boxBetween(
    [-halfRun, 0, backZ - banquette.depth + 0.03],
    [halfRun, banquette.plinthHeight, backZ],
  );
}

const terraceTables = tables.filter((table) => table.zone === 'terrace');
const terraceSeatPlateIds = new Set(
  terraceTables.flatMap((table) =>
    table.seats.map((seat) => seat.id.replace(/^seat\./, 'plate.')),
  ),
);
const terracePlacements = [
  ...tablePlacements(terraceTables),
  ...plates.filter((plate) => terraceSeatPlateIds.has(plate.id.replace(/\.(plate|pasta)$/, ''))),
  ...terraceTableSettings,
  ...terraceDecor,
];

const terraceGamePlacements = terracePlacements.filter((placement) => !placement.assetId.startsWith('food.'));

export function Terrace({ showDemoFood = true }: { showDemoFood?: boolean }) {
  return (
    <group name="zone.terrace">
      <StaticMesh build={buildFloor} material="limestone" castShadow={false} />
      <StaticMesh build={buildRailing} material="plaster" />
      <StaticMesh build={buildBanquettePlinth} material="plaster" />
      {terraceTables.map((table) => (
        <TableSet key={table.id} table={table} />
      ))}
      <PlacedAssets placements={showDemoFood ? terracePlacements : terraceGamePlacements} />
      <WarmLights placements={terraceWarmLights} />
    </group>
  );
}
