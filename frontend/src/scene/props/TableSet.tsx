import { plateSlots, type DecorPlacement, type DiningTable, type Seat } from '../../data/layout';
import { Interactable } from '../Interactable';
import { HitProxy } from './Asset';

function seatAssetId(seat: Seat, zone: DiningTable['zone']): string {
  if (seat.type === 'banquette') return 'seat.banquette';
  return zone === 'terrace' ? 'seat.terraceChair' : 'seat.chair';
}

/** 테이블과 좌석의 보이는 모습. 구역 전체를 모아 PlacedAssets에 넘긴다. */
export function tablePlacements(tables: DiningTable[]): DecorPlacement[] {
  return tables.flatMap((table) => [
    {
      id: table.id,
      assetId: `table.${table.shape}`,
      position: table.position,
      rotationY: table.rotationY,
    },
    ...table.seats.map((seat) => ({
      id: seat.id,
      assetId: seatAssetId(seat, table.zone),
      position: seat.position,
      rotationY: seat.rotationY,
    })),
  ]);
}

/** 테이블 하나의 상호작용 레이어: layout id를 가진 판정 상자들. 그리는 비용은 없다. */
export function TableSet({ table }: { table: DiningTable }) {
  const seatIds = new Set(table.seats.map((seat) => seat.id));
  return (
    <>
      <Interactable kind="table" id={table.id} position={table.position} rotationY={table.rotationY}>
        <HitProxy assetId={`table.${table.shape}`} />
      </Interactable>
      {table.seats.map((seat) => (
        <Interactable
          key={seat.id}
          kind="seat"
          id={seat.id}
          position={seat.position}
          rotationY={seat.rotationY}
        >
          <HitProxy assetId={seatAssetId(seat, table.zone)} />
        </Interactable>
      ))}
      {plateSlots
        .filter((slot) => seatIds.has(slot.ownerId))
        .map((slot) => (
          <Interactable key={slot.id} kind="plateSlot" id={slot.id} position={slot.position}>
            <HitProxy assetId="plate.dinner" />
          </Interactable>
        ))}
    </>
  );
}
