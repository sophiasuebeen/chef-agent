import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import { tables, waypoints } from '../../data/layout';
import { staffRoute, taskWaypoint, type RestaurantState, type StaffTask } from '../../game/restaurant';
import { chefLabel, type StaffProgress } from '../../live';
import { advanceConsultation, consultationTarget, type ConsultationTrip } from '../../game/consultation';
import type { Language } from '../../game/language';
import { Asset } from '../props/Asset';
import { dishAsset } from '../../data/menuPresentation';

function Staff({ id, home, task, menu, speech, language, onArrive, attendingTable, consultation, consultationTable, consultationReady = false, onConsultationStage, onConsultationReturn }: {
  id: string; home: string; task: StaffTask | null; menu?: string; speech?: string; language: Language;
  onArrive: (id: string, taskId: number) => Promise<void>; attendingTable?: string | null;
  consultation?: StaffProgress | null; consultationTable?: string | null; consultationReady?: boolean;
  onConsultationStage?: (trip: ConsultationTrip) => void; onConsultationReturn?: (turn: number) => void;
}) {
  const root = useRef<Group>(null), legs = [useRef<Group>(null), useRef<Group>(null)];
  const currentNode = useRef(home), route = useRef<string[]>([]), destination = useRef(home);
  const pauseUntil = useRef(0), lastTask = useRef<number | null>(null), lastAttempt = useRef(0);
  const trip = useRef<ConsultationTrip | null>(null);
  const initial = waypoints.find((p) => p.id === home)!;
  const manager = id === 'manager';
  const trim = manager ? '#293544' : id === 'waiter_a' ? '#44694b' : '#8a4b39';
  useFrame(({ clock }, rawDelta) => {
    if (!root.current) return;
    const now = clock.elapsedTime;
    if (consultation && consultationTable && trip.current?.turn !== consultation.turn) {
      trip.current = { turn: consultation.turn, stage: 'meeting', returnTo: `wp.${consultationTable}`, since: now };
      onConsultationStage?.(trip.current);
    }
    if (trip.current && trip.current.stage !== 'done') {
      const target = consultationTarget(trip.current);
      const before = trip.current;
      const next = advanceConsultation(before, now, route.current.length === 0 && currentNode.current === target,
        consultationReady, task?.kind === 'deliver');
      if (next !== before) {
        trip.current = next;
        onConsultationStage?.(next);
        // Bring an already-ready dish on the return journey when one is assigned at the pass.
        if (before.stage === 'waiting' && next.stage === 'returning' && task?.kind === 'pickup') void onArrive(id, task.id);
        if (next.stage === 'done') { pauseUntil.current = now + 5; onConsultationReturn?.(next.turn); }
      }
    }
    if (lastTask.current !== null && task === null) pauseUntil.current = now + 5;
    lastTask.current = task?.id ?? null;
    const consulting = trip.current && trip.current.stage !== 'done' && task?.kind !== 'deliver';
    const target = consulting ? consultationTarget(trip.current!)! : task ? taskWaypoint(task) : attendingTable ? `wp.${attendingTable}` :
      now < pauseUntil.current ? destination.current : home;
    // Finish the current graph edge before replanning, avoiding shortcuts across tables.
    if (target !== destination.current) {
      const next = route.current[0];
      route.current = [...(next ? [next] : []), ...staffRoute(next ?? currentNode.current, target).slice(1)];
      destination.current = target;
    }
    const nextId = route.current[0];
    let walking = false;
    if (nextId) {
      const point = waypoints.find((p) => p.id === nextId)!;
      const dx = point.position[0] - root.current.position.x, dz = point.position[2] - root.current.position.z;
      const distance = Math.hypot(dx, dz), reach = Math.min(rawDelta, 0.1) * 2.1;
      walking = distance > reach;
      root.current.rotation.y = Math.atan2(dx, dz);
      if (distance <= reach) { root.current.position.x = point.position[0]; root.current.position.z = point.position[2];
        currentNode.current = nextId; route.current.shift(); }
      else { root.current.position.x += dx / distance * reach; root.current.position.z += dz / distance * reach; }
    } else {
      const table = tables.find((t) => t.id === (task?.table_id ?? attendingTable));
      if (table) root.current.rotation.y = Math.atan2(table.position[0] - root.current.position.x, table.position[2] - root.current.position.z);
      if (!consulting && task && currentNode.current === taskWaypoint(task) && now - lastAttempt.current > 0.5) {
        lastAttempt.current = now;
        void onArrive(id, task.id);
      }
    }
    legs.forEach((leg, side) => { if (leg.current) leg.current.rotation.x = walking ? Math.sin(now * 9 + side * Math.PI) * 0.42 : 0; });
  });
  return <group ref={root} name={`staff.${id}`} position={initial.position} userData={{ kind: 'staff', id }}>
    {[0, 1].map((side) => <group key={side} ref={legs[side]} position={[side ? 0.09 : -0.09, 0.8, 0]}>
      <mesh position={[0, -0.35, 0]} castShadow><capsuleGeometry args={[0.065, 0.58, 5, 10]} /><meshStandardMaterial color="#303137" /></mesh>
      <mesh position={[0, -0.76, 0.045]}><boxGeometry args={[0.13, 0.08, 0.24]} /><meshStandardMaterial color="#292727" /></mesh>
    </group>)}
    <mesh position={[0, 1.08, 0]} scale={[1, 1, 0.7]} castShadow><cylinderGeometry args={[0.21, 0.17, 0.57, 16]} /><meshStandardMaterial color={manager ? trim : '#faf5e9'} /></mesh>
    <mesh position={[0, 0.89, 0.135]}><boxGeometry args={[0.32, 0.52, 0.035]} /><meshStandardMaterial color={trim} /></mesh>
    <mesh position={[0, 1.28, 0.15]} rotation-z={Math.PI / 4}><boxGeometry args={[0.055, 0.055, 0.02]} /><meshStandardMaterial color={trim} /></mesh>
    {[-1, 1].map((side) => <mesh key={side} position={[side * 0.24, 1.03, menu ? 0.18 : 0]} rotation-x={menu ? -0.8 : 0} castShadow>
      <capsuleGeometry args={[0.045, 0.48, 5, 10]} /><meshStandardMaterial color={manager ? trim : '#faf5e9'} /></mesh>)}
    <mesh position={[0, 1.43, 0]}><cylinderGeometry args={[0.05, 0.05, 0.13, 12]} /><meshStandardMaterial color="#e8c4a4" /></mesh>
    <mesh position={[0, 1.58, 0]} scale={[0.115, 0.14, 0.105]} castShadow><sphereGeometry args={[1, 18, 14]} /><meshStandardMaterial color="#e8c4a4" /></mesh>
    <mesh position={[0, 1.63, -0.018]} scale={[0.12, 0.11, 0.1]}><sphereGeometry args={[1, 18, 12, 0, Math.PI * 2, 0, 1.8]} /><meshStandardMaterial color="#30251f" /></mesh>
    {[-1, 1].map((side) => <mesh key={side} position={[side * 0.04, 1.6, 0.1]}><sphereGeometry args={[0.009, 8, 6]} /><meshStandardMaterial color="#30251f" /></mesh>)}
    {menu && <group name={`staff.${id}.dish`} position={[0, 1.02, 0.38]}><Asset id="plate.dinner" /><Asset id={dishAsset(menu)} /></group>}
    <Html position={[0, speech ? 2.1 : 1.96, 0]} center zIndexRange={speech ? [20, 10] : [5, 0]}>
      {speech ? <div className="speech-bubble">{speech}</div> : <span className="map-label">{chefLabel(id, language)}</span>}
    </Html>
  </group>;
}

export function RestaurantStaff({ state, speech, language, orderMenu, onArrive, conversationTable, consultation, consultationReady, onConsultationStage, onConsultationReturn }: {
  state: RestaurantState; speech: { speaker: string; text: string } | null; language: Language;
  orderMenu: (id: string) => string | undefined; onArrive: (id: string, taskId: number) => Promise<void>;
  conversationTable?: string | null;
  consultation?: StaffProgress | null; consultationReady?: boolean;
  onConsultationStage?: (trip: ConsultationTrip) => void; onConsultationReturn?: (turn: number) => void;
}) {
  return <>
    {state.waiters.map((waiter) => <Staff key={waiter.id} id={waiter.id} home={waiter.id === 'waiter_a' ? 'wp.front.w' : 'wp.front.e'}
      task={waiter.task} menu={waiter.carrying ? orderMenu(waiter.carrying) : undefined} language={language}
      attendingTable={state.tables.find((table) => table.id === conversationTable && table.waiter_id === waiter.id)?.id}
      consultation={consultation?.speaker === waiter.id ? consultation : null} consultationTable={state.active_table}
      consultationReady={consultationReady} onConsultationStage={onConsultationStage} onConsultationReturn={onConsultationReturn}
      speech={speech?.speaker === waiter.id ? speech.text : undefined} onArrive={onArrive} />)}
    <Staff id="manager" home="wp.entrance" task={null} language={language} onArrive={onArrive}
      attendingTable={speech?.speaker === 'manager' ? state.active_table : null}
      speech={speech?.speaker === 'manager' ? speech.text : undefined} />
  </>;
}
