import type { StationActivity } from '../replayPresentation';

export function PrepStation({ activity }: { activity?: StationActivity }) {
  const herb = activity?.taskId === 'prepare_mint' || activity?.taskId === 'chop_parsley';
  const seafood = activity?.taskId === 'prepare_seafood';
  const many = herb || seafood;
  return <group name="replay.prep-board">
    <mesh position={[0, 0.012, 0]} receiveShadow><boxGeometry args={[0.46, 0.024, 0.32]} />
      <meshStandardMaterial color="#bd9567" roughness={0.88} /></mesh>
    {Array.from({ length: many ? 14 : 5 }, (_, i) => <mesh key={i}
      position={[-0.08 + (i % 5) * 0.035, 0.034, -0.07 + Math.floor(i / 5) * 0.043]}
      rotation-y={i * 1.3} scale={herb ? [0.024, 0.005, 0.012] : seafood ? [0.024, 0.012, 0.012] : [0.018, 0.014, 0.012]}>
      <sphereGeometry args={[1, 8, 6]} /><meshStandardMaterial color={herb ? '#497744' : seafood ? '#e8906f' : '#eee2bc'} roughness={0.92} /></mesh>)}
  </group>;
}
