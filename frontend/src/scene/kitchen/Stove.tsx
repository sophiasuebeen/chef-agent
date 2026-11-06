import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';

export function Stove({ heated, time }: { heated: boolean; time: number }) {
  const flames = useRef<Group>(null);
  useFrame(() => {
    if (flames.current) flames.current.scale.y = 1 + Math.sin(time * 4) * 0.12;
  });
  return <group name="replay.stove">
    <mesh position={[0, 0.009, 0]}><boxGeometry args={[0.55, 0.018, 0.47]} />
      <meshStandardMaterial color="#38424a" metalness={0.6} roughness={0.42} /></mesh>
    <mesh position={[0, 0.026, 0]} rotation-x={Math.PI / 2}><torusGeometry args={[0.145, 0.018, 8, 24]} />
      <meshStandardMaterial color="#20282f" metalness={0.8} roughness={0.4} /></mesh>
    {[-1, 1].map((sign) => <mesh key={sign} position={[0, 0.035, 0]} rotation-y={sign * Math.PI / 4}>
      <boxGeometry args={[0.35, 0.018, 0.018]} /><meshStandardMaterial color="#20282f" metalness={0.8} /></mesh>)}
    {heated && <group ref={flames} name="replay.heat" position={[0, 0.035, 0]}>
      {Array.from({ length: 12 }, (_, i) => <mesh key={i} position={[Math.cos(i * Math.PI / 6) * 0.11, 0.032, Math.sin(i * Math.PI / 6) * 0.11]}>
        <coneGeometry args={[0.018, 0.075, 7]} /><meshStandardMaterial color="#55bdf7" emissive="#248bed" emissiveIntensity={2.2} toneMapped={false} /></mesh>)}
      <pointLight color="#71bdff" intensity={0.35} distance={0.7} />
    </group>}
  </group>;
}
