import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, DoubleSide, FrontSide, Group, MeshStandardMaterial } from 'three';
import { stations } from '../../data/layout';
import { chefStandPoint, type ChefActivity } from '../replayPresentation';

const COLORS = { skin: '#edcfb3', jacket: '#faf8f1', navy: '#293f66', pants: '#252a33',
  hair: '#171412', lemon: '#f6cf31', eye: '#30231f', white: '#fffcf4' };
/** Apron and collar per chef, so several can be told apart. The first keeps the reference navy. */
const TRIM = [COLORS.navy, '#7c2f33', '#2f6a4c', '#7a5a22'];

/** Thin scalp-following curtain, parted at the front, ending at chest height. */
function hairGeometry() {
  const vertices: number[] = [], indices: number[] = [];
  const columns = 42, rows = 12;
  for (let row = 0; row <= rows; row++) {
    const v = row / rows;
    for (let column = 0; column <= columns; column++) {
      const angle = 0.77 + column / columns * (Math.PI * 2 - 1.54);
      const radius = 0.107 + 0.012 * Math.sin(v * Math.PI / 2);
      vertices.push(Math.sin(angle) * radius,
        1.625 - v * 0.435 + (row === rows ? Math.sin(column * 2.7) * 0.004 : 0),
        Math.cos(angle) * (0.102 + v * 0.009));
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column, b = a + columns + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function armAngles(y: number, z: number) {
  const upper = 0.275, lower = 0.27;
  const down = 1.32 - y;
  const distance = Math.min(upper + lower - 0.001, Math.hypot(down, z));
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  return [
    -Math.atan2(z, down) + Math.acos(clamp((upper ** 2 + distance ** 2 - lower ** 2) / (2 * upper * distance))),
    -Math.acos(clamp((distance ** 2 - upper ** 2 - lower ** 2) / (2 * upper * lower))),
  ];
}

/** ~7 heads without the toque, with independent shoulders, elbows, wrists, hips and knees. */
export function Chef({ activity, index = 0, time, live = false, speech }: {
  activity: ChefActivity; index?: number; time: number;
  /** Walk at human speed in real time, since a live kitchen's clock runs fast. */
  live?: boolean;
  speech?: string;
}) {
  const root = useRef<Group>(null), torso = useRef<Group>(null);
  const placed = useRef(false);
  const shoulders = [useRef<Group>(null), useRef<Group>(null)];
  const elbows = [useRef<Group>(null), useRef<Group>(null)];
  const wrists = [useRef<Group>(null), useRef<Group>(null)];
  const hips = [useRef<Group>(null), useRef<Group>(null)];
  const knees = [useRef<Group>(null), useRef<Group>(null)];
  const hair = useMemo(hairGeometry, []);
  const materials = useMemo(() => Object.fromEntries(Object.entries({ ...COLORS, navy: TRIM[index] ?? COLORS.navy }).map(([key, color]) =>
    [key, new MeshStandardMaterial({ color, roughness: key === 'hair' ? 0.97 : 0.78, side: key === 'hair' ? DoubleSide : FrontSide })])) as Record<keyof typeof COLORS, MeshStandardMaterial>, [index]);

  useFrame(({ clock }, rawDelta) => {
    if (!root.current || !torso.current) return;
    const target = stations.find((s) => s.type === activity.station)!;
    const previous = stations.find((s) => s.type === activity.fromStation)!;
    const progress = activity.travel * activity.travel * (3 - 2 * activity.travel);
    let walking = progress < 1 && target.type !== previous.type;
    const phase = (live ? clock.elapsedTime : activity.elapsed) * 2.1;
    const [fromX, fromZ] = chefStandPoint(previous, activity.fromEquipmentSlot !== undefined && ['boil', 'sauce'].includes(previous.type)
      ? [(activity.fromEquipmentSlot - 1) * 0.5, activity.offset[1]] : activity.offset);
    const [toX, toZ] = chefStandPoint(target, activity.equipmentSlot !== undefined && ['boil', 'sauce'].includes(target.type)
      ? [(activity.equipmentSlot - 1) * 0.5, activity.offset[1]] : activity.offset);
    if (live) {
      const position = root.current.position;
      const dx = toX - position.x, dz = toZ - position.z;
      const distance = Math.hypot(dx, dz);
      const reach = Math.min(rawDelta, 0.1) * 2.3;
      walking = placed.current && distance > 0.02;
      if (!placed.current || distance <= reach) { position.x = toX; position.z = toZ; }
      else { position.x += dx / distance * reach; position.z += dz / distance * reach; }
      placed.current = true;
      position.y = walking ? Math.abs(Math.sin(phase * 4)) * 0.012 : 0;
      root.current.rotation.y = walking ? Math.atan2(dx, dz) : target.position[2] < target.chefSpot[2] ? Math.PI : 0;
    } else {
      root.current.position.set(fromX + (toX - fromX) * progress,
        walking ? Math.abs(Math.sin(phase * 4)) * 0.012 : 0, fromZ + (toZ - fromZ) * progress);
      root.current.rotation.y = walking ? Math.atan2(toX - fromX, toZ - fromZ)
        : target.position[2] < target.chefSpot[2] ? Math.PI : 0;
    }
    torso.current.rotation.set(activity.motion === 'idle' || walking ? 0 : 0.045, 0,
      activity.motion === 'idle' ? Math.sin(time * 0.5) * 0.004 : 0);
    for (let side = 0; side < 2; side++) {
      const shoulder = shoulders[side]!.current, elbow = elbows[side]!.current;
      const wrist = wrists[side]!.current, hip = hips[side]!.current, knee = knees[side]!.current;
      if (!shoulder || !elbow || !wrist || !hip || !knee) continue;
      const sign = side === 0 ? -1 : 1;
      hip.rotation.x = walking ? sign * Math.sin(phase * 4) * 0.4 : 0;
      knee.rotation.x = walking ? Math.max(0, -sign * Math.sin(phase * 4)) * 0.45 : 0;
      shoulder.rotation.set(walking ? -hip.rotation.x : 0, 0, sign * 0.07);
      elbow.rotation.x = -0.1; wrist.rotation.set(0, 0, 0);
      if (activity.motion === 'idle' || walking) continue;
      if (activity.motion === 'talk') {
        if (side === 0) continue; // One hand gestures while talking; the other rests.
        const gesture = armAngles(1.12 + Math.sin(phase * 1.4) * 0.05, 0.3);
        shoulder.rotation.x = gesture[0]!; elbow.rotation.x = gesture[1]!;
        wrist.rotation.z = Math.sin(phase * 2) * 0.25;
        continue;
      }
      let y = 1.015, z = 0.405;
      const wave = Math.sin(phase * (activity.motion === 'chop' ? 3 : 1.5) + side * Math.PI);
      if (activity.motion === 'chop') y += side === 1 ? Math.max(0, wave) * 0.07 : 0;
      if (activity.motion === 'crush') { y += Math.max(0, wave) * 0.045; z = 0.39; }
      if (activity.motion === 'collect') { y = 1.08 + wave * 0.055; z = 0.36 + Math.cos(phase) * 0.025; }
      if (activity.motion === 'stir') { y += Math.sin(phase) * 0.018; z += Math.cos(phase) * 0.025; }
      if (activity.motion === 'plate') { y += 0.035 + wave * 0.025; z += Math.cos(phase) * 0.03; }
      if (activity.motion === 'drain') { y += 0.055; z -= 0.025; }
      if (activity.motion === 'serve') { y = 1.06; z = 0.41; }
      const angles = armAngles(y, z);
      shoulder.rotation.x = angles[0]!; elbow.rotation.x = angles[1]!;
      shoulder.rotation.z = -sign * (activity.motion === 'stir' ? 0.18 + Math.sin(phase) * 0.045 : 0.18);
      wrist.rotation.x = activity.motion === 'drain' ? -0.3 + Math.sin(phase) * 0.08 : -0.1;
      wrist.rotation.z = activity.motion === 'plate' ? wave * 0.2 : 0;
    }
  });

  return <group ref={root} name={`replay.${activity.name}`} userData={{ kind: 'chef', id: activity.name }}>
    {speech && <Html position={[0, 2.12, 0]} center zIndexRange={[20, 10]}><div className="speech-bubble">{speech}</div></Html>}
    {[0, 1].map((side) => <group key={side} ref={hips[side]} position={[side === 0 ? -0.095 : 0.095, 0.84, 0]}>
      <mesh position={[0, -0.205, 0]} material={materials.pants} castShadow><capsuleGeometry args={[0.069, 0.285, 6, 12]} /></mesh>
      <group ref={knees[side]} position={[0, -0.4, 0]}>
        <mesh position={[0, -0.18, 0]} material={materials.pants} castShadow><capsuleGeometry args={[0.06, 0.26, 6, 12]} /></mesh>
        <mesh position={[0, -0.385, 0.045]} scale={[0.075, 0.045, 0.13]} material={materials.jacket} castShadow><sphereGeometry args={[1, 16, 10]} /></mesh>
      </group>
    </group>)}
    <group ref={torso}>
      <mesh position={[0, 1.08, 0]} scale={[1, 1, 0.64]} material={materials.jacket} castShadow>
        <cylinderGeometry args={[0.205, 0.17, 0.48, 20]} /></mesh>
      <mesh position={[0, 0.865, 0]} scale={[1, 1, 0.65]} material={materials.jacket} castShadow>
        <cylinderGeometry args={[0.17, 0.195, 0.10, 20]} /></mesh>
      <mesh position={[0, 1.377, 0]} material={materials.skin}><cylinderGeometry args={[0.046, 0.051, 0.13, 16]} /></mesh>
      <mesh position={[0, 1.334, 0]} scale={[1, 1, 0.72]} material={materials.jacket}><cylinderGeometry args={[0.085, 0.09, 0.06, 20]} /></mesh>
      <mesh position={[0, 1.365, 0]} scale={[1, 1, 0.72]} material={materials.navy}><cylinderGeometry args={[0.087, 0.087, 0.009, 20]} /></mesh>
      {[-0.065, 0.065].flatMap((x) => [0.97, 1.08, 1.19].map((y) =>
        <mesh key={`${x}/${y}`} position={[x, y, 0.132]} scale={[1, 1, 0.5]} material={materials.navy}><sphereGeometry args={[0.012, 10, 8]} /></mesh>))}
      <mesh position={[0, 0.904, 0]} scale={[1, 1, 0.67]} material={materials.navy}><cylinderGeometry args={[0.179, 0.179, 0.035, 24]} /></mesh>
      <mesh position={[0, 0.674, 0.143]} material={materials.navy} castShadow><boxGeometry args={[0.34, 0.45, 0.022]} /></mesh>
      {[-0.135, -0.09, -0.045, 0, 0.045, 0.09, 0.135].map((x) => <mesh key={x} position={[x, 0.674, 0.155]}>
        <boxGeometry args={[0.002, 0.44, 0.001]} /><meshStandardMaterial color="#576b8c" roughness={1} /></mesh>)}
      <mesh position={[-0.088, 0.71, 0.16]} material={materials.navy}><boxGeometry args={[0.09, 0.11, 0.009]} /></mesh>
      <mesh position={[0.083, 0.78, 0.16]} scale={[0.018, 0.012, 0.004]} material={materials.lemon}><sphereGeometry args={[1, 12, 8]} /></mesh>
      <mesh position={[0.09, 0.795, 0.161]} rotation-z={0.5}><boxGeometry args={[0.016, 0.005, 0.002]} /><meshStandardMaterial color="#72915a" /></mesh>
      <mesh position={[0, 1.527, 0.007]} scale={[0.104, 0.126, 0.098]} material={materials.skin} castShadow><sphereGeometry args={[1, 28, 20]} /></mesh>
      <mesh position={[0, 1.521, 0.106]} scale={[0.011, 0.018, 0.012]} material={materials.skin}><sphereGeometry args={[1, 12, 10]} /></mesh>
      {[-1, 1].map((sign) => <group key={sign}>
        <mesh position={[sign * 0.04, 1.552, 0.096]} scale={[0.023, 0.010, 0.004]} material={materials.white}><sphereGeometry args={[1, 16, 10]} /></mesh>
        <mesh position={[sign * 0.04, 1.551, 0.1]} scale={[0.009, 0.009, 0.003]} material={materials.eye}><sphereGeometry args={[1, 12, 8]} /></mesh>
        <mesh position={[sign * 0.038, 1.554, 0.103]} material={materials.white}><sphereGeometry args={[0.0028, 8, 6]} /></mesh>
        <mesh position={[sign * 0.041, 1.577, 0.091]} material={materials.eye}><boxGeometry args={[0.033, 0.004, 0.003]} /></mesh>
      </group>)}
      <mesh position={[0, 1.486, 0.094]} scale={[0.023, 0.0035, 0.003]}><sphereGeometry args={[1, 16, 8]} /><meshStandardMaterial color="#bd756b" roughness={0.9} /></mesh>
      <mesh geometry={hair} material={materials.hair} castShadow />
      <mesh position={[0, 1.535, -0.004]} scale={[0.108, 0.132, 0.104]} material={materials.hair} castShadow>
        <sphereGeometry args={[1, 28, 12, 0, Math.PI * 2, 0, 1.21]} /></mesh>
      <mesh position={[0, 1.677, 0]} scale={[1, 1, 0.87]} material={materials.jacket} castShadow><cylinderGeometry args={[0.114, 0.109, 0.069, 28]} /></mesh>
      <mesh position={[0, 1.647, 0]} rotation-x={Math.PI / 2} scale={[1, 0.87, 1]} material={materials.navy}><torusGeometry args={[0.110, 0.0035, 6, 28]} /></mesh>
      <mesh position={[0, 1.777, 0]} scale={[1, 1, 0.87]} material={materials.jacket} castShadow><cylinderGeometry args={[0.14, 0.114, 0.14, 16]} /></mesh>
      <mesh position={[0, 1.847, 0]} scale={[0.14, 0.025, 0.122]} material={materials.jacket} castShadow><sphereGeometry args={[1, 20, 10]} /></mesh>
      {[0, 1].map((side) => <group key={side} ref={shoulders[side]} position={[side === 0 ? -0.209 : 0.209, 1.32, 0]}>
        <mesh position={[0, -0.03, 0]} scale={[0.085, 0.085, 0.075]} material={materials.jacket} castShadow><sphereGeometry args={[1, 16, 12]} /></mesh>
        <mesh position={[0, -0.137, 0]} material={materials.jacket} castShadow><cylinderGeometry args={[0.067, 0.052, 0.275, 16]} /></mesh>
        <group ref={elbows[side]} position={[0, -0.275, 0]}>
          <mesh position={[0, -0.065, 0]} material={materials.jacket} castShadow><cylinderGeometry args={[0.053, 0.045, 0.14, 16]} /></mesh>
          <mesh position={[0, -0.15, 0]} material={materials.skin} castShadow><capsuleGeometry args={[0.033, 0.17, 4, 12]} /></mesh>
          <group ref={wrists[side]} position={[0, -0.275, 0]}>
            <mesh position={[0, -0.027, 0]} scale={[0.031, 0.044, 0.022]} material={materials.skin} castShadow><sphereGeometry args={[1, 12, 10]} /></mesh>
            <mesh position={[side === 0 ? 0.027 : -0.027, -0.018, 0.008]} scale={[0.011, 0.022, 0.012]} material={materials.skin}><sphereGeometry args={[1, 10, 8]} /></mesh>
            {side === 1 && ['chop', 'crush'].includes(activity.motion) && <group position={[0, -0.03, 0.04]} rotation-x={-Math.PI / 2}>
              <mesh material={materials.pants}><boxGeometry args={[0.025, 0.09, 0.025]} /></mesh>
              <mesh position={[0, -0.115, 0]}><boxGeometry args={[0.012, 0.16, 0.05]} /><meshStandardMaterial color="#bdc7ce" metalness={0.8} roughness={0.24} /></mesh>
            </group>}
            {side === 1 && activity.motion === 'stir' && <group position={[0, -0.035, 0]} rotation-x={0.35}>
              <mesh position={[0, -0.11, 0]}><cylinderGeometry args={[0.009, 0.009, 0.23, 10]} /><meshStandardMaterial color="#9c6943" /></mesh>
              <mesh position={[0, -0.23, 0]} scale={[0.022, 0.035, 0.009]}><sphereGeometry args={[1, 10, 8]} /><meshStandardMaterial color="#9c6943" /></mesh>
            </group>}
          </group>
        </group>
      </group>)}
    </group>
  </group>;
}
