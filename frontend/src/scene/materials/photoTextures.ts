import { RepeatWrapping, SRGBColorSpace, type Texture, TextureLoader } from 'three';

/** /public/assets/textures의 CC0 사진 텍스처. 출처는 public/assets/CREDITS.md에 있다. */
const loader = new TextureLoader();
const ANISOTROPY = 16;

type PhotoMap = 'diff' | 'nor_gl' | 'rough';

/** UV가 미터 단위이므로 repeat = 1 / 실제 크기(m)다. */
function photo(id: string, map: PhotoMap, meters: number): Texture {
  const texture = loader.load(`/assets/textures/${id}/${map}.jpg`);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1 / meters, 1 / meters);
  texture.anisotropy = ANISOTROPY;
  if (map === 'diff') texture.colorSpace = SRGBColorSpace;
  return texture;
}

const MARBLE_METERS = 1.5;
const PLASTER_METERS = 3.2;
const LINEN_METERS = 0.27;
const BOUCLE_METERS = 0.35;
const OAK_METERS = 1.83;
const WALNUT_METERS = 1.8;
const BARK_METERS = 1;

export const photoTextures = {
  floorColor: photo('marble_01', 'diff', MARBLE_METERS),
  floorNormal: photo('marble_01', 'nor_gl', MARBLE_METERS),
  floorRough: photo('marble_01', 'rough', MARBLE_METERS),
  plasterColor: photo('plastered_wall_04', 'diff', PLASTER_METERS),
  plasterNormal: photo('plastered_wall_04', 'nor_gl', PLASTER_METERS),
  linenNormal: photo('rough_linen', 'nor_gl', LINEN_METERS),
  boucleNormal: photo('wool_boucle', 'nor_gl', BOUCLE_METERS),
  oakColor: photo('oak_veneer_01', 'diff', OAK_METERS),
  walnutColor: photo('walnut_veneer', 'diff', WALNUT_METERS),
  barkColor: photo('jolcham_oak_bark_01', 'diff', BARK_METERS),
  barkNormal: photo('jolcham_oak_bark_01', 'nor_gl', BARK_METERS),
};
