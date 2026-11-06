import { Html } from '@react-three/drei';
import { KITCHEN, stations } from '../../data/layout';
import { Asset } from '../props/Asset';
import { Chef } from '../characters/Chef';
import { kitchenFrame, type KitchenFrame } from '../replayPresentation';
import { Cookware } from './Cookware';
import { PrepStation } from './PrepStation';
import { Stove } from './Stove';

const EMPTY = kitchenFrame(null, null, 0);
const dishAsset = (menu: string) => menu === 'seafood_tomato' ? 'food.seafoodTomato' : 'food.pasta';

export function KitchenReplay({ frame = EMPTY }: { frame?: KitchenFrame }) {
  return <group name="replay.kitchen">
    {frame.chefs.map((chef, index) => <Chef key={chef.name} activity={chef} index={index} time={frame.time} />)}
    {stations.filter((station) => station.type !== 'dish').map((station) => {
      const activities = frame.stations.filter((candidate) => candidate.station === station.type);
      const activity = activities[0];
      const orderCount = new Set(activities.map((a) => a.orderId)).size;
      const isChef = frame.chefs.some((chef) => chef.station === station.type && chef.motion !== 'idle');
      // Put work on the accessible edge of the existing counter, facing its chef spot.
      const edge = station.position[2] < station.chefSpot[2] ? 0.23 : -0.20;
      return <group key={station.id} position={[station.position[0], KITCHEN.counterHeight + 0.003, station.position[2] + edge]}>
        {['boil', 'sauce'].includes(station.type) && <>
          <Stove heated={!!activity?.heated} time={frame.time} />
          <Cookware kind={station.type === 'boil' ? 'pot' : 'pan'} activity={activity} time={frame.time} />
        </>}
        {station.type === 'prep' && <PrepStation activity={activity} />}
        {station.type === 'pantry' && <>
          {[0, 1, 2].map((i) => <mesh key={i} position={[-0.18 + i * 0.1, 0.055, 0]} scale={[0.045, 0.045, 0.035]}>
            <sphereGeometry args={[1, 14, 10]} /><meshStandardMaterial color="#f2cf36" roughness={0.7} /></mesh>)}
          <mesh position={[0.19, 0.13, -0.08]}><cylinderGeometry args={[0.055, 0.055, 0.26, 16]} />
            <meshStandardMaterial color="#e5cf94" roughness={0.8} /></mesh>
        </>}
        {station.type === 'plating' && <group scale={1.3}><Asset id="plate.dinner" />
          {activity && <Asset id={dishAsset(activity.menu)} />}</group>}
        {station.type === 'pass' && frame.served.slice(-6).map((order, index, visible) => <group key={order.orderId}
          position={[(index - (visible.length - 1) / 2) * 0.4, 0.005, -0.04]} scale={1.2}>
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
