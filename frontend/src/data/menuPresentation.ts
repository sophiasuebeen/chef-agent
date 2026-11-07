import type { AssetId } from '../assets/registry';

/** One mapping for plating, pass, carried dishes and table delivery. */
export function dishAsset(menu: string): AssetId {
  if (menu === 'seafood_tomato') return 'food.seafoodTomato';
  if (menu === 'fig_pasta') return 'food.figPasta';
  return 'food.pasta';
}
