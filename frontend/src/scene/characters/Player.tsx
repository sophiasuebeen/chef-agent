import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { Group, MeshStandardMaterial, Vector3 } from 'three';
import { moveVector, PLAYER_SPEED, step, zoneAt, clampCamera, type Zone } from '../../game/movement';

export interface PlayerState {
  x: number;
  z: number;
  heading: number;
  /** Camera direction around the customer. 0 looks toward the kitchen. */
  yaw: number;
  /** Where a click asked to walk to. */
  target: [x: number, z: number] | null;
}

const COLORS = { skin: '#e8c4a4', shirt: '#2f7d8c', stripe: '#f4efe2', shorts: '#d9c6a0', hat: '#e7cf94', band: '#a8552f', shoe: '#6d4b34' };
const KEYS: Record<string, [forward: number, right: number]> = {
  w: [1, 0], arrowup: [1, 0], s: [-1, 0], arrowdown: [-1, 0],
  a: [0, -1], arrowleft: [0, -1], d: [0, 1], arrowright: [0, 1],
};
const CAMERA_DISTANCE = 4.4;
const CAMERA_HEIGHT = 3.1;
const FOCUS_HEIGHT = 1.15;
const KEY_TURN_SPEED = 1.8;

function isTyping() {
  const element = document.activeElement;
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
}

/** The customer: walks the restaurant, and owns the camera that follows them. */
export function Player({ state, enabled, speech, onZone, debugOutput }: {
  state: MutableRefObject<PlayerState>;
  enabled: boolean;
  speech?: string;
  onZone: (zone: Zone) => void;
  debugOutput?: MutableRefObject<HTMLElement | null>;
}) {
  const root = useRef<Group>(null);
  const hips = [useRef<Group>(null), useRef<Group>(null)];
  const shoulders = [useRef<Group>(null), useRef<Group>(null)];
  const pressed = useRef(new Set<string>());
  const zone = useRef<Zone>(null);
  const camera = useThree((three) => three.camera);
  const focus = useRef(new Vector3(state.current.x, FOCUS_HEIGHT, state.current.z));
  const placed = useRef(false);
  const materials = useMemo(() => Object.fromEntries(Object.entries(COLORS).map(([key, color]) =>
    [key, new MeshStandardMaterial({ color, roughness: 0.8 })])) as Record<keyof typeof COLORS, MeshStandardMaterial>, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (isTyping()) return;
      const key = event.key.toLowerCase();
      if (KEYS[key] || key === 'q' || key === 'r') {
        event.preventDefault();
        pressed.current.add(key);
        state.current.target = null;
      }
    };
    const up = (event: KeyboardEvent) => pressed.current.delete(event.key.toLowerCase());
    const clear = () => pressed.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, [state]);

  useFrame(({ clock }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const player = state.current;
    let forward = 0, right = 0;
    if (enabled && !isTyping()) {
      for (const key of pressed.current) {
        forward += KEYS[key]?.[0] ?? 0;
        right += KEYS[key]?.[1] ?? 0;
      }
      if (pressed.current.has('q')) player.yaw += KEY_TURN_SPEED * delta;
      if (pressed.current.has('r')) player.yaw -= KEY_TURN_SPEED * delta;
    } else if (isTyping()) pressed.current.clear();
    let [dx, dz] = moveVector(forward, right, player.yaw);
    if (enabled && !dx && !dz && player.target) {
      const toX = player.target[0] - player.x, toZ = player.target[1] - player.z;
      const distance = Math.hypot(toX, toZ);
      if (distance < 0.08) player.target = null;
      else { dx = toX / distance; dz = toZ / distance; }
    }
    let walking = false;
    if (enabled && (dx || dz)) {
      const [nextX, nextZ] = step(player.x, player.z, dx * PLAYER_SPEED * delta, dz * PLAYER_SPEED * delta);
      walking = nextX !== player.x || nextZ !== player.z;
      if (!walking) player.target = null; // Walked into something: stop trying.
      player.x = nextX; player.z = nextZ;
      if (walking) player.heading = Math.atan2(dx, dz);
    }
    const nextZone = zoneAt(player.x, player.z);
    if (nextZone !== zone.current) {
      zone.current = nextZone;
      onZone(nextZone);
    }
    if (debugOutput?.current) debugOutput.current.dataset.player = `${player.x.toFixed(2)},${player.z.toFixed(2)}`;

    if (root.current) {
      root.current.position.set(player.x, walking ? Math.abs(Math.sin(clock.elapsedTime * 9)) * 0.02 : 0, player.z);
      root.current.rotation.y = player.heading;
    }
    const swing = walking ? Math.sin(clock.elapsedTime * 9) * 0.55 : 0;
    hips.forEach((hip, side) => { if (hip.current) hip.current.rotation.x = (side ? 1 : -1) * swing; });
    shoulders.forEach((shoulder, side) => { if (shoulder.current) shoulder.current.rotation.x = (side ? -1 : 1) * swing * 0.8; });

    const [cameraX, cameraZ] = clampCamera(player.x + Math.sin(player.yaw) * CAMERA_DISTANCE,
      player.z + Math.cos(player.yaw) * CAMERA_DISTANCE, player.z);
    const rate = placed.current ? 1 - Math.exp(-5 * delta) : 1;
    placed.current = true;
    camera.position.x += (cameraX - camera.position.x) * rate;
    camera.position.y += (CAMERA_HEIGHT - camera.position.y) * rate;
    camera.position.z += (cameraZ - camera.position.z) * rate;
    focus.current.x += (player.x - focus.current.x) * rate;
    focus.current.z += (player.z - focus.current.z) * rate;
    camera.lookAt(focus.current);
  });

  return <group ref={root} name="player" position={[state.current.x, 0, state.current.z]} rotation-y={state.current.heading}>
    <mesh position={[0, 0.012, 0]} rotation-x={-Math.PI / 2}><circleGeometry args={[0.3, 24]} /><meshBasicMaterial color="#000000" transparent opacity={0.22} depthWrite={false} /></mesh>
    {[0, 1].map((side) => <group key={side} ref={hips[side]} position={[side ? 0.09 : -0.09, 0.82, 0]}>
      <mesh position={[0, -0.14, 0]} material={materials.shorts} castShadow><capsuleGeometry args={[0.078, 0.17, 6, 12]} /></mesh>
      <mesh position={[0, -0.5, 0]} material={materials.skin} castShadow><capsuleGeometry args={[0.052, 0.48, 6, 12]} /></mesh>
      <mesh position={[0, -0.79, 0.04]} scale={[0.07, 0.04, 0.13]} material={materials.shoe}><sphereGeometry args={[1, 14, 10]} /></mesh>
    </group>)}
    <mesh position={[0, 1.08, 0]} scale={[1, 1, 0.68]} material={materials.shirt} castShadow><cylinderGeometry args={[0.2, 0.17, 0.56, 20]} /></mesh>
    {[0.93, 1.08, 1.22].map((y) => <mesh key={y} position={[0, y, 0]} scale={[1, 1, 0.68]} material={materials.stripe}><cylinderGeometry args={[0.2 - (1.36 - y) * 0.06 + 0.005, 0.2 - (1.36 - y) * 0.06 + 0.005, 0.025, 20]} /></mesh>)}
    {[0, 1].map((side) => <group key={side} ref={shoulders[side]} position={[side ? 0.215 : -0.215, 1.31, 0]}>
      <mesh position={[0, -0.09, 0]} material={materials.shirt} castShadow><capsuleGeometry args={[0.055, 0.12, 6, 10]} /></mesh>
      <mesh position={[0, -0.34, 0]} material={materials.skin} castShadow><capsuleGeometry args={[0.04, 0.32, 6, 10]} /></mesh>
    </group>)}
    <mesh position={[0, 1.39, 0]} material={materials.skin}><cylinderGeometry args={[0.048, 0.052, 0.12, 14]} /></mesh>
    <mesh position={[0, 1.53, 0.005]} scale={[0.105, 0.125, 0.1]} material={materials.skin} castShadow><sphereGeometry args={[1, 24, 18]} /></mesh>
    {[-1, 1].map((sign) => <mesh key={sign} position={[sign * 0.04, 1.555, 0.098]} scale={[0.012, 0.012, 0.005]}><sphereGeometry args={[1, 10, 8]} /><meshStandardMaterial color="#2e2420" /></mesh>)}
    <mesh position={[0, 1.625, 0]} material={materials.hat} castShadow><cylinderGeometry args={[0.095, 0.112, 0.1, 22]} /></mesh>
    <mesh position={[0, 1.598, 0]} material={materials.band}><cylinderGeometry args={[0.114, 0.114, 0.03, 22]} /></mesh>
    <mesh position={[0, 1.58, 0]} scale={[1, 0.08, 1]} material={materials.hat} castShadow><cylinderGeometry args={[0.21, 0.23, 0.2, 26]} /></mesh>
    {speech && <Html position={[0, 2.0, 0]} center zIndexRange={[20, 10]}><div className="speech-bubble customer">{speech}</div></Html>}
  </group>;
}
