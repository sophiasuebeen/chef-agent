import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { CanvasTexture, DoubleSide, Group, Sprite, SpriteMaterial } from 'three';
import type { StationActivity } from '../replayPresentation';

/** No elapsed wall clock or random state: seeking restores each puff exactly. */
function Steam({ time, active }: { time: number; active: boolean }) {
  const puffs = useRef<(Sprite | null)[]>([]);
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.35)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
    return new CanvasTexture(canvas);
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(() => {
    puffs.current.forEach((sprite, index) => {
      if (!sprite) return;
      const phase = ((time * 0.37 + index / 9) % 1 + 1) % 1;
      sprite.position.set(Math.sin(index * 2.4 + phase * 3) * (0.02 + phase * 0.07), phase * 0.65, Math.cos(index * 1.7) * 0.065);
      sprite.scale.setScalar(0.11 + phase * 0.22);
      (sprite.material as SpriteMaterial).opacity = active ? Math.sin(phase * Math.PI) * 0.48 : 0;
    });
  });
  return <group name="replay.steam" visible={active} position={[0, 0.23, 0]}>
    {Array.from({ length: 9 }, (_, i) => <sprite key={i} ref={(sprite) => { puffs.current[i] = sprite; }}>
      <spriteMaterial map={texture} transparent depthWrite={false} opacity={0} />
    </sprite>)}
  </group>;
}

export function Cookware({ kind, activity, time }: { kind: 'pot' | 'pan'; activity?: StationActivity; time: number }) {
  const vessel = useRef<Group>(null), stream = useRef<Group>(null);
  const draining = activity?.taskId === 'reserve_water_and_drain';
  useFrame(() => {
    if (vessel.current) {
      vessel.current.rotation.x = draining ? 0.5 + Math.sin(time * 1.4) * 0.08 : 0;
      vessel.current.position.y = draining ? 0.12 : 0;
    }
    if (stream.current) stream.current.scale.y = 0.85 + Math.sin(time * 5) * 0.13;
  });
  return <group name={`replay.${kind}`} position={[0, 0.06, 0]}>
    <group ref={vessel}>
      <mesh position={[0, kind === 'pot' ? 0.10 : 0.035, 0]} castShadow>
        <cylinderGeometry args={[kind === 'pot' ? 0.16 : 0.195, kind === 'pot' ? 0.145 : 0.16, kind === 'pot' ? 0.20 : 0.07, 32, 1, true]} />
        <meshStandardMaterial color={kind === 'pot' ? '#aebcc7' : '#3d474c'} metalness={0.82} roughness={0.24} side={DoubleSide} />
      </mesh>
      <mesh position={[0, kind === 'pot' ? 0.018 : 0.024, 0]}><cylinderGeometry args={[0.145, 0.145, 0.018, 28]} />
        <meshStandardMaterial color="#687780" metalness={0.7} roughness={0.3} /></mesh>
      <mesh position={[0, kind === 'pot' ? 0.20 : 0.07, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[kind === 'pot' ? 0.16 : 0.195, 0.008, 8, 32]} /><meshStandardMaterial color="#d3dce0" metalness={0.9} roughness={0.2} /></mesh>
      {kind === 'pot' ? [-1, 1].map((sign) => <mesh key={sign} position={[sign * 0.19, 0.14, 0]}>
        <boxGeometry args={[0.09, 0.025, 0.07]} /><meshStandardMaterial color="#303b43" roughness={0.6} /></mesh>)
        : <mesh position={[0.30, 0.045, 0]} rotation-z={-0.06}><boxGeometry args={[0.27, 0.035, 0.045]} /><meshStandardMaterial color="#303b43" roughness={0.65} /></mesh>}
      {activity && <mesh position={[0, kind === 'pot' ? 0.15 : 0.047, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[kind === 'pot' ? 0.145 : 0.16, 32]} /><meshStandardMaterial
          color={kind === 'pot' ? '#90c5ce' : activity.menu === 'seafood_tomato' ? '#b93a24' : '#e9cf81'} roughness={0.27} transparent opacity={0.85} /></mesh>}
      <Steam time={time} active={!!activity?.steam} />
    </group>
    {draining && <group ref={stream} name="replay.drain" position={[0, 0.04, 0.2]}>
      <mesh rotation-x={0.35}><cylinderGeometry args={[0.012, 0.022, 0.20, 10]} /><meshStandardMaterial color="#9dd9e7" transparent opacity={0.7} /></mesh>
      <mesh position={[0, -0.06, 0.04]}><cylinderGeometry args={[0.13, 0.06, 0.07, 20, 1, true]} />
        <meshStandardMaterial color="#bdc7cf" metalness={0.8} roughness={0.28} side={DoubleSide} /></mesh>
    </group>}
  </group>;
}
