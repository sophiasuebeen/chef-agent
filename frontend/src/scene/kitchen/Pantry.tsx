import { useEffect, useMemo } from 'react';
import { CanvasTexture, DoubleSide } from 'three';
import { ingredientName, type Language } from '../../game/language';

export const PANTRY_INGREDIENTS = ['spaghetti', 'water', 'salt', 'lemon', 'butter', 'garlic', 'mint', 'cheese',
  'shrimp', 'mussels', 'squid', 'tomato', 'olive oil', 'parsley', 'fig', 'basil'];

function Label({ text }: { text: string }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#eee3c9'; context.fillRect(0, 0, 256, 64);
    context.fillStyle = '#303e35'; context.font = '600 29px sans-serif'; context.textAlign = 'center';
    context.fillText(text, 128, 42, 238);
    return new CanvasTexture(canvas);
  }, [text]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={[0, -0.025, 0.198]}><planeGeometry args={[0.24, 0.06]} /><meshBasicMaterial map={texture} /></mesh>;
}

function Ingredient({ name }: { name: string }) {
  const herb = name === 'mint' || name === 'parsley' || name === 'basil';
  const seafood = ['shrimp', 'mussels', 'squid'].includes(name);
  if (herb) return <group>
    <mesh position={[0, 0.05, 0]}><cylinderGeometry args={[0.07, 0.05, 0.1, 12]} /><meshStandardMaterial color="#b96d46" /></mesh>
    {Array.from({ length: 7 }, (_, i) => <group key={i} rotation-y={i * 2.4}>
      <mesh position={[0.018, 0.16, 0]} rotation-z={0.25}><cylinderGeometry args={[0.003, 0.004, 0.18, 5]} /><meshStandardMaterial color="#59793e" /></mesh>
      {[0, 1].map((side) => <mesh key={side} position={[side ? 0.045 : -0.025, 0.16 + side * 0.06, 0]} scale={[0.045, 0.012, 0.025]} rotation-z={side ? 0.4 : -0.4}>
        <sphereGeometry args={[1, 10, 6]} /><meshStandardMaterial color={name === 'mint' ? '#497c3b' : '#315d36'} /></mesh>)}
    </group>)}
  </group>;
  if (seafood) return <group>
    <mesh position={[0, 0.025, 0]}><boxGeometry args={[0.24, 0.05, 0.23]} /><meshStandardMaterial color="#b9ced0" metalness={0.55} roughness={0.4} /></mesh>
    {Array.from({ length: 4 }, (_, i) => <group key={i} position={[(i % 2 - 0.5) * 0.09, 0.065, (Math.floor(i / 2) - 0.5) * 0.09]} rotation-y={i * 1.7}>
      {name === 'shrimp' ? <mesh rotation-x={-Math.PI / 2}><torusGeometry args={[0.025, 0.011, 6, 12, Math.PI * 1.5]} /><meshStandardMaterial color="#edaa90" /></mesh>
        : name === 'mussels' ? <mesh scale={[0.026, 0.018, 0.045]}><sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color="#283f47" roughness={0.3} /></mesh>
        : <mesh rotation-x={Math.PI / 2}><torusGeometry args={[0.026, 0.009, 6, 12]} /><meshStandardMaterial color="#f0ddce" /></mesh>}
    </group>)}
  </group>;
  if (name === 'spaghetti') return <group>
    <mesh position={[0, 0.12, 0]}><cylinderGeometry args={[0.065, 0.06, 0.24, 14, 1, true]} /><meshStandardMaterial color="#9db6b1" side={DoubleSide} metalness={0.2} /></mesh>
    {Array.from({ length: 13 }, (_, i) => <mesh key={i} position={[Math.cos(i * 2.4) * 0.04, 0.22, Math.sin(i * 2.4) * 0.04]} rotation-z={(i % 3 - 1) * 0.05}>
      <cylinderGeometry args={[0.003, 0.003, 0.34, 5]} /><meshStandardMaterial color="#e3bf65" /></mesh>)}
  </group>;
  if (name === 'water' || name === 'olive oil' || name === 'salt') return <group>
    <mesh position={[0, 0.11, 0]}><cylinderGeometry args={[0.055, 0.06, 0.22, 14]} /><meshStandardMaterial color={name === 'water' ? '#8bbbc6' : name === 'salt' ? '#e4ded0' : '#4f6543'} roughness={0.28} metalness={0.15} /></mesh>
    <mesh position={[0, 0.245, 0]}><cylinderGeometry args={[0.025, 0.025, 0.05, 10]} /><meshStandardMaterial color={name === 'salt' ? '#899591' : '#c1a779'} /></mesh>
    <mesh position={[0, 0.12, 0.055]}><planeGeometry args={[0.07, 0.09]} /><meshStandardMaterial color="#eee4cb" /></mesh>
  </group>;
  if (name === 'butter' || name === 'cheese') return <group>
    <mesh position={[0, 0.01, 0]}><boxGeometry args={[0.24, 0.02, 0.18]} /><meshStandardMaterial color="#ece4d5" /></mesh>
    <mesh position={[0, 0.065, 0]} rotation-y={name === 'cheese' ? 0.2 : 0}><boxGeometry args={[0.16, 0.09, 0.11]} /><meshStandardMaterial color={name === 'butter' ? '#f2d782' : '#d6bb70'} /></mesh>
  </group>;
  return <group>
    <mesh position={[0, 0.02, 0]}><cylinderGeometry args={[0.12, 0.1, 0.04, 14]} /><meshStandardMaterial color="#ad7950" /></mesh>
    {[0, 1, 2].map((i) => <group key={i} position={[(i - 1) * 0.06, 0.075 + (i === 1 ? 0.025 : 0), i === 1 ? -0.03 : 0.025]}>
      <mesh scale={name === 'lemon' ? [0.05, 0.035, 0.035] : name === 'fig' ? [0.037, 0.047, 0.037] : [0.04, 0.04, 0.04]}><sphereGeometry args={[1, 14, 10]} /><meshStandardMaterial color={name === 'lemon' ? '#edc541' : name === 'tomato' ? '#bf4935' : name === 'fig' ? '#68365b' : '#e7dbc5'} roughness={0.6} /></mesh>
      {name === 'tomato' && <mesh position={[0, 0.04, 0]} rotation-x={Math.PI / 2}><circleGeometry args={[0.018, 5]} /><meshStandardMaterial color="#537747" side={DoubleSide} /></mesh>}
    </group>)}
  </group>;
}

/** Visible recipe stock; quantity is unlimited, matching the simulator inventory contract. */
export function Pantry({ ingredients = PANTRY_INGREDIENTS, language = 'ko' }: { ingredients?: string[]; language?: Language }) {
  const stock = [...new Set(ingredients)];
  const levels = Math.max(3, Math.ceil(stock.length / 5));
  return <group name="kitchen.pantry-stock" position={[0, 0, -0.12]}>
    {Array.from({ length: levels }, (_, level) => <mesh key={level} position={[0, level * 0.44 - 0.02, 0]} castShadow>
      <boxGeometry args={[1.48, 0.045, 0.38]} /><meshStandardMaterial color="#91704d" roughness={0.85} /></mesh>)}
    {[-0.73, 0.73].map((x) => <mesh key={x} position={[x, (levels - 1) * 0.22 + 0.03, -0.17]}><boxGeometry args={[0.035, (levels - 1) * 0.44 + 0.17, 0.035]} /><meshStandardMaterial color="#354b46" metalness={0.5} /></mesh>)}
    {stock.map((name, i) => <group key={name} name={`ingredient.${name}`} position={[(i % 5 - 2) * 0.285, Math.floor(i / 5) * 0.44 + 0.01, 0]}>
      <Ingredient name={name} /><Label text={ingredientName(name, language)} />
    </group>)}
  </group>;
}
