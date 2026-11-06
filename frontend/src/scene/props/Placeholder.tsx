import type { ComponentType } from 'react';
import type { AssetProps, DetailTier } from '../../assets/registry';
import type { Vec3 } from '../../data/layout';
import { useDetailColor } from '../materials/detailColor';

interface PlaceholderSpec {
  shape: 'box' | 'cylinder';
  size: Vec3;
  color: string;
  tier: DetailTier;
}

/** 실제 소품이 만들어지기 전의 자리표시자. 바닥면 중심이 로컬 원점이다. */
export function makePlaceholder(spec: PlaceholderSpec): ComponentType<AssetProps> {
  return function Placeholder({ size = spec.size }: AssetProps) {
    const color = useDetailColor(spec.tier, spec.color);
    const [width, height, depth] = size;
    return (
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        {spec.shape === 'box' ? (
          <boxGeometry args={[width, height, depth]} />
        ) : (
          <cylinderGeometry args={[width / 2, width / 2, height, 24]} />
        )}
        <meshStandardMaterial color={color} />
      </mesh>
    );
  };
}
