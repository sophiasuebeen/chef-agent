import type { DetailTier } from '../../assets/registry';
import { useSceneStore } from '../../state/sceneStore';

const DETAIL_COLORS: Record<DetailTier, string> = {
  interactive: '#e8833a',
  background: '#a9bdd2',
  far: '#e0dbd2',
};

/** "디테일 단계 색상 모드"가 켜져 있으면 단계 색을, 아니면 원래 색을 돌려준다. */
export function useDetailColor(tier: DetailTier, color: string): string {
  const detailMode = useSceneStore((state) => state.debug.detailColorMode);
  return detailMode ? DETAIL_COLORS[tier] : color;
}
