import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { MENU_BOARD } from '../../game/movement';
import type { Menu } from '../../game/useLiveKitchen';

const WIDTH = 512, HEIGHT = 700;

function wrapped(context: CanvasRenderingContext2D, text: string, y: number, lineHeight: number) {
  let line = '', top = y;
  for (const word of text.split(' ')) {
    if (context.measureText(`${line}${word}`).width > WIDTH - 90 && line) {
      context.fillText(line.trim(), WIDTH / 2, top);
      line = ''; top += lineHeight;
    }
    line += `${word} `;
  }
  context.fillText(line.trim(), WIDTH / 2, top);
  return top + lineHeight;
}

/** A chalkboard drawn from the real menu, so it cannot disagree with what the kitchen cooks. */
function chalkboard(menus: Menu[]) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH; canvas.height = HEIGHT;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#20302a'; context.fillRect(0, 0, WIDTH, HEIGHT);
  context.strokeStyle = '#d9c9a3'; context.lineWidth = 8; context.strokeRect(20, 20, WIDTH - 40, HEIGHT - 40);
  context.textAlign = 'center';
  context.fillStyle = '#f5e9c8'; context.font = '700 62px Georgia, serif';
  context.fillText('MENU', WIDTH / 2, 100);
  let y = 180;
  for (const menu of menus) {
    context.fillStyle = '#f7d774'; context.font = '700 36px Georgia, serif';
    y = wrapped(context, menu.name, y, 44) + 2;
    context.fillStyle = '#e8e2d2'; context.font = '23px Georgia, serif';
    y = wrapped(context, menu.ingredients.join(', '), y, 30) + 34;
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function MenuBoard({ menus }: { menus: Menu[] }) {
  const texture = useMemo(() => chalkboard(menus), [menus]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <group name="menuBoard" position={[MENU_BOARD[0], 0, MENU_BOARD[1]]} rotation-y={0.45} userData={{ kind: 'menuBoard', id: 'menuBoard' }}>
    <mesh position={[0, 1.02, 0]} castShadow><boxGeometry args={[0.74, 1.0, 0.05]} /><meshStandardMaterial color="#7b5a3a" roughness={0.8} /></mesh>
    <mesh position={[0, 1.02, 0.028]}><planeGeometry args={[0.68, 0.94]} /><meshStandardMaterial map={texture} roughness={0.95} /></mesh>
    {[-0.28, 0.28].map((x) => <mesh key={x} position={[x, 0.27, -0.06]} rotation-x={0.12} castShadow><boxGeometry args={[0.05, 0.56, 0.05]} /><meshStandardMaterial color="#6a4c31" roughness={0.85} /></mesh>)}
    <mesh position={[0, 0.27, 0.07]} rotation-x={-0.12} castShadow><boxGeometry args={[0.05, 0.56, 0.05]} /><meshStandardMaterial color="#6a4c31" roughness={0.85} /></mesh>
  </group>;
}
