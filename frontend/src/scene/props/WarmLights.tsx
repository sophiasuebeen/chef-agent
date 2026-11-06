import type { DecorPlacement } from '../../data/layout';
import { timeOfDayPresets } from '../../data/timeOfDay';
import { useSceneStore } from '../../state/sceneStore';
import { PlacedAssets } from './Asset';

/** 저녁 시간대에만 켜지는 불빛 면. 디테일 색상 모드에서는 끈다. */
export function WarmLights({ placements }: { placements: DecorPlacement[] }) {
  const visible = useSceneStore(
    (state) => timeOfDayPresets[state.timeOfDay].showWarmLights && !state.debug.detailColorMode,
  );
  return (
    <group visible={visible}>
      <PlacedAssets placements={placements} />
    </group>
  );
}
