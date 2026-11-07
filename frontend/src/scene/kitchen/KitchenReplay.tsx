import { Html } from '@react-three/drei';
import { KITCHEN, stations } from '../../data/layout';
import { Asset } from '../props/Asset';
import { Chef } from '../characters/Chef';
import { kitchenFrame, type KitchenFrame } from '../replayPresentation';
import { Cookware } from './Cookware';
import { PrepStation } from './PrepStation';
import { Stove } from './Stove';
import { Pantry } from './Pantry';
import type { Language } from '../../game/language';
import { dishAsset } from '../../data/menuPresentation';

const EMPTY = kitchenFrame(null, null, 0);

export function KitchenReplay({ frame = EMPTY, live = false, speech, equipmentCount = 1, ingredients, language = 'ko' }: {
  frame?: KitchenFrame; live?: boolean; speech?: { speaker: string; text: string };
  equipmentCount?: number; ingredients?: string[]; language?: Language;
}) {
  return <group name="replay.kitchen">
    {frame.chefs.map((chef, index) => <Chef key={chef.name} activity={chef} index={index} time={frame.time} live={live}
      speech={speech?.speaker === chef.name ? speech.text : undefined} />)}
    {stations.filter((station) => station.type !== 'dish').map((station) => {
      const activities = frame.stations.filter((candidate) => candidate.station === station.type);
      const activity = activities[0];
      const orderCount = new Set(activities.map((a) => a.orderId)).size;
      const isChef = frame.chefs.some((chef) => chef.station === station.type && chef.motion !== 'idle');
      // Put work on the accessible edge of the existing counter, facing its chef spot.
      const edge = station.position[2] < station.chefSpot[2] ? 0.23 : -0.20;
      return <group key={station.id} position={[station.position[0], KITCHEN.counterHeight + 0.003, station.position[2] + edge]}>
        {['boil', 'sauce'].includes(station.type) && <>
          {Array.from({ length: equipmentCount }, (_, index) => {
            const vesselActivity = equipmentCount === 1 ? activity : activities.find((item) => item.equipmentSlot === index);
            return <group key={index} name={`${station.type}.unit.${index + 1}`}
              position={[(index - (equipmentCount - 1) / 2) * 0.5, 0, 0]} scale={equipmentCount > 1 ? 0.75 : 1}>
              <Stove heated={!!vesselActivity?.heated} time={frame.time} />
              <Cookware kind={station.type === 'boil' ? 'pot' : 'pan'} activity={vesselActivity} time={frame.time} />
            </group>;
          })}
        </>}
        {station.type === 'prep' && <PrepStation activity={activity} />}
        {station.type === 'pantry' && <Pantry ingredients={ingredients} language={language} />}
        {station.type === 'plating' && <group scale={1.3}><Asset id="plate.dinner" />
          {activity && <Asset id={dishAsset(activity.menu)} />}</group>}
        {station.type === 'pass' && frame.served.map((order, index, visible) => <group key={order.orderId}
          position={[(index % 8 - (Math.min(visible.length, 8) - 1) / 2) * 0.34, Math.floor(index / 16) * 0.12 + 0.005, -0.03 - Math.floor(index / 8) % 2 * 0.28]} scale={1.1}>
          <Asset id="plate.dinner" /><Asset id={dishAsset(order.menu)} />
          <Html position={[0, 0.20, 0]} center zIndexRange={[8, 0]}><span className="served-ticket">{order.orderId} ✓</span></Html>
        </group>)}
        {station.type !== 'pass' && <Html position={[0, 0.10, station.type === 'plating' ? 0.20 : -0.17]} center zIndexRange={[8, 0]}>
          <span className={`station-tag ${activity || isChef ? 'active' : ''}`}>
            {station.type}{activity ? ` · ${activity.orderId}` : ''}{orderCount > 1 ? ` +${orderCount - 1}` : ''}{activity?.heated ? ' · heat' : ''}
          </span>
        </Html>}
        {(activity || isChef) && <mesh position={[0, -0.002, edge > 0 ? 0.17 : -0.17]}>
          <boxGeometry args={[station.size[0] * 0.80, 0.012, 0.025]} /><meshBasicMaterial color="#e9bf43" />
        </mesh>}
      </group>;
    })}
  </group>;
}
