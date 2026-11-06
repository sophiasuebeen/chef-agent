import { CanvasTexture, ClampToEdgeWrapping, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { seededRandom } from '../props/geometry';

/**
 * 절차적 텍스처. 사진으로 대체하기 어려운 무늬(타일 배치, 줄무늬, 그림, 빛 번짐)를 그린다.
 * 소품의 UV는 미터 단위이므로(boxProjectUVs) 텍스처 repeat = 1 / 한 장의 실제 크기(m)다.
 */

type Paint = (context: CanvasRenderingContext2D, size: number) => void;

const ANISOTROPY = 16;

function makeTexture(pixels: number, meters: number, isColor: boolean, paint: Paint): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = pixels;
  canvas.height = pixels;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is not available');
  paint(context, pixels);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1 / meters, 1 / meters);
  texture.anisotropy = ANISOTROPY;
  if (isColor) texture.colorSpace = SRGBColorSpace;
  return texture;
}

function gray(value: number, alpha = 1) {
  const level = Math.round(value * 255);
  return `rgba(${level},${level},${level},${alpha})`;
}

/** 타일 경계에서 이어지도록 가장자리 원을 반대쪽에도 그린다. */
function wrappedCircle(context: CanvasRenderingContext2D, size: number, x: number, y: number, radius: number) {
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) {
      context.beginPath();
      context.arc(x + dx, y + dy, radius, 0, Math.PI * 2);
      context.fill();
    }
  }
}

function blotches(
  context: CanvasRenderingContext2D,
  size: number,
  seed: number,
  count: number,
  minRadius: number,
  maxRadius: number,
  shade: () => string,
) {
  const random = seededRandom(seed);
  for (let index = 0; index < count; index += 1) {
    context.fillStyle = shade();
    wrappedCircle(context, size, random() * size, random() * size, minRadius + random() * (maxRadius - minRadius));
  }
}

function speckle(context: CanvasRenderingContext2D, size: number, seed: number, strength: number) {
  const random = seededRandom(seed);
  const image = context.getImageData(0, 0, size, size);
  const { data } = image;
  for (let index = 0; index < data.length; index += 4) {
    const delta = (random() - 0.5) * strength;
    data[index] = (data[index] ?? 0) + delta;
    data[index + 1] = (data[index + 1] ?? 0) + delta;
    data[index + 2] = (data[index + 2] ?? 0) + delta;
  }
  context.putImageData(image, 0, 0);
}

// 회벽 --------------------------------------------------------------------

const PLASTER_METERS = 2.5;

export const plasterColor = makeTexture(256, PLASTER_METERS * 2, true, (context, size) => {
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  const random = seededRandom(111);
  blotches(context, size, 112, 340, 14, 62, () =>
    random() > 0.5 ? `rgba(198,180,150,${0.03 + random() * 0.07})` : `rgba(255,252,244,${0.04 + random() * 0.08})`,
  );
});

// 석회암 타일 --------------------------------------------------------------

const TILE_METERS = 1.2;
const TILES_PER_SHEET = 4;
const LIMESTONE_METERS = TILE_METERS * TILES_PER_SHEET;
const GROUT_METERS = 0.018;

function eachTile(size: number, paint: (x: number, y: number, tile: number, column: number, row: number) => void) {
  const tile = size / TILES_PER_SHEET;
  for (let row = 0; row < TILES_PER_SHEET; row += 1) {
    for (let column = 0; column < TILES_PER_SHEET; column += 1) {
      paint(column * tile, row * tile, tile, column, row);
    }
  }
}

export const limestoneColor = makeTexture(1024, LIMESTONE_METERS, true, (context, size) => {
  const grout = (GROUT_METERS / LIMESTONE_METERS) * size;
  const random = seededRandom(201);
  context.fillStyle = '#b9a98f';
  context.fillRect(0, 0, size, size);
  eachTile(size, (x, y, tile) => {
    const warm = 236 + random() * 12;
    context.fillStyle = `rgb(${warm},${warm - 4},${warm - 12})`;
    context.fillRect(x + grout / 2, y + grout / 2, tile - grout, tile - grout);
    context.save();
    context.beginPath();
    context.rect(x + grout / 2, y + grout / 2, tile - grout, tile - grout);
    context.clip();
    for (let index = 0; index < 36; index += 1) {
      context.fillStyle = `rgba(${random() > 0.5 ? '205,190,165' : '255,252,244'},${0.03 + random() * 0.06})`;
      context.beginPath();
      context.ellipse(
        x + random() * tile,
        y + random() * tile,
        4 + random() * 32,
        2 + random() * 11,
        random() * Math.PI,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
    context.restore();
  });
  speckle(context, size, 202, 7);
});

export const limestoneBump = makeTexture(1024, LIMESTONE_METERS, false, (context, size) => {
  const grout = (GROUT_METERS / LIMESTONE_METERS) * size;
  context.fillStyle = gray(0.2);
  context.fillRect(0, 0, size, size);
  eachTile(size, (x, y, tile) => {
    context.fillStyle = gray(0.8);
    context.fillRect(x + grout / 2, y + grout / 2, tile - grout, tile - grout);
  });
});

// 대리석 ------------------------------------------------------------------

export const marbleColor = makeTexture(1024, 1.6, true, (context, size) => {
  const random = seededRandom(401);
  context.fillStyle = '#f4f3ef';
  context.fillRect(0, 0, size, size);
  blotches(context, size, 402, 70, 30, 150, () => `rgba(212,212,208,${0.05 + random() * 0.07})`);
  for (let vein = 0; vein < 26; vein += 1) {
    let x = random() * size;
    let y = random() * size;
    let angle = random() * Math.PI * 2;
    const dark = random() > 0.45;
    context.strokeStyle = dark
      ? `rgba(128,124,118,${0.07 + random() * 0.12})`
      : `rgba(178,170,156,${0.07 + random() * 0.11})`;
    context.lineWidth = 0.6 + random() * 2.2;
    context.beginPath();
    context.moveTo(x, y);
    const steps = 30 + Math.floor(random() * 60);
    for (let step = 0; step < steps; step += 1) {
      angle += (random() - 0.5) * 0.7;
      x += Math.cos(angle) * 11;
      y += Math.sin(angle) * 11;
      context.lineTo(x, y);
    }
    context.stroke();
  }
});

// 테라코타 ----------------------------------------------------------------

export const terracottaColor = makeTexture(256, 0.4, true, (context, size) => {
  const random = seededRandom(601);
  context.fillStyle = '#b8623a';
  context.fillRect(0, 0, size, size);
  blotches(context, size, 602, 260, 2, 14, () =>
    random() > 0.5 ? `rgba(226,142,92,${0.06 + random() * 0.1})` : `rgba(122,62,34,${0.06 + random() * 0.1})`,
  );
  speckle(context, size, 603, 18);
});

// 주방 타일 ---------------------------------------------------------------

const KITCHEN_TILE_COUNT = 8;
const KITCHEN_TILE_METERS = 0.25;

export const kitchenTileColor = makeTexture(1024, KITCHEN_TILE_COUNT * KITCHEN_TILE_METERS, true, (context, size) => {
  const random = seededRandom(701);
  const tile = size / KITCHEN_TILE_COUNT;
  const grout = 5;
  context.fillStyle = '#d5d2ca';
  context.fillRect(0, 0, size, size);
  for (let row = 0; row < KITCHEN_TILE_COUNT; row += 1) {
    for (let column = 0; column < KITCHEN_TILE_COUNT; column += 1) {
      const roll = random();
      context.fillStyle = roll > 0.84 ? '#7f97ad' : roll > 0.68 ? '#bcc9d1' : '#efebe0';
      context.fillRect(column * tile + grout / 2, row * tile + grout / 2, tile - grout, tile - grout);
    }
  }
});

// 땅 ----------------------------------------------------------------------

export const sandColor = makeTexture(512, 6, true, (context, size) => {
  const random = seededRandom(801);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  blotches(context, size, 802, 500, 4, 40, () =>
    random() > 0.5 ? `rgba(198,178,140,${0.03 + random() * 0.05})` : `rgba(255,250,235,${0.04 + random() * 0.05})`,
  );
  speckle(context, size, 803, 16);
});

// 쿠션 줄무늬 --------------------------------------------------------------

const RIB_METERS = 0.2;
const RIB_COUNT = 10;

/** 굵은 골이 가로로 지는 면 쿠션. 생성 색과 베이지가 번갈아 난다. */
export const pillowStripeColor = makeTexture(512, RIB_METERS, true, (context, size) => {
  const random = seededRandom(1101);
  const rib = size / RIB_COUNT;
  for (let index = 0; index < RIB_COUNT; index += 1) {
    context.fillStyle = index % 2 === 0 ? '#e6dac3' : '#c8b08a';
    context.fillRect(0, index * rib, size, rib);
  }
  for (let thread = 0; thread < 900; thread += 1) {
    context.fillStyle = `rgba(${random() > 0.5 ? '255,250,238' : '110,88,60'},${0.03 + random() * 0.07})`;
    context.fillRect(random() * size, random() * size, 2 + random() * 22, 1);
  }
});

export const pillowStripeBump = makeTexture(256, RIB_METERS, false, (context, size) => {
  const rib = size / RIB_COUNT;
  for (let index = 0; index < RIB_COUNT; index += 1) {
    const gradient = context.createLinearGradient(0, index * rib, 0, (index + 1) * rib);
    gradient.addColorStop(0, gray(0.1));
    gradient.addColorStop(0.5, gray(0.95));
    gradient.addColorStop(1, gray(0.1));
    context.fillStyle = gradient;
    context.fillRect(0, index * rib, size, rib);
  }
});

// 손으로 그린 장식 접시 ------------------------------------------------------

/** 접시 반지름(m). 소품 UV가 미터 단위이므로 지름 하나가 텍스처 한 장에 맞도록 repeat을 정한다. */
export const PAINTED_PLATE_RADIUS = 0.24;

export const paintedPlateColor = (() => {
  const texture = makeTexture(512, PAINTED_PLATE_RADIUS * 2, true, (context, size) => {
    const center = size / 2;
    const random = seededRandom(1201);
    const ring = (radius: number, width: number, color: string) => {
      context.strokeStyle = color;
      context.lineWidth = width;
      context.beginPath();
      context.arc(center, center, radius, 0, Math.PI * 2);
      context.stroke();
    };
    context.fillStyle = '#f4efe2';
    context.fillRect(0, 0, size, size);
    ring(size * 0.47, size * 0.05, '#4a6680');
    ring(size * 0.415, size * 0.008, '#c79a3c');
    // 붓으로 찍은 꽃잎 띠
    for (let index = 0; index < 18; index += 1) {
      const angle = (index / 18) * Math.PI * 2 + (random() - 0.5) * 0.04;
      context.save();
      context.translate(center + Math.cos(angle) * size * 0.34, center + Math.sin(angle) * size * 0.34);
      context.rotate(angle);
      context.fillStyle = index % 2 === 0 ? '#5a7a94' : '#8a8f7a';
      context.beginPath();
      context.ellipse(0, 0, size * (0.05 + random() * 0.008), size * 0.017, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
    ring(size * 0.25, size * 0.006, '#4a6680');
    // 가운데 소용돌이 무늬
    context.strokeStyle = '#4a6680';
    context.lineCap = 'round';
    for (let arm = 0; arm < 6; arm += 1) {
      const start = (arm / 6) * Math.PI * 2;
      context.lineWidth = size * 0.012;
      context.beginPath();
      for (let step = 0; step <= 24; step += 1) {
        const radius = (step / 24) * size * 0.2;
        const angle = start + (step / 24) * 1.7;
        const x = center + Math.cos(angle) * radius;
        const y = center + Math.sin(angle) * radius;
        if (step === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }
    context.fillStyle = '#c79a3c';
    context.beginPath();
    context.arc(center, center, size * 0.03, 0, Math.PI * 2);
    context.fill();
  });
  texture.offset.set(0.5, 0.5);
  return texture;
})();

// 해질녘 빛 번짐 --------------------------------------------------------------

export const WASH_WIDTH = 2;
export const WASH_HEIGHT = 4.2;
export const POOL_RADIUS = 1.9;

function clampLight(texture: Texture) {
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  return texture;
}

/** 바닥에서 위로 퍼지는 업라이트. 밑이 가장 밝고 위로 갈수록 좁아지며 사라진다. */
export const wallWashTexture = (() => {
  const texture = clampLight(
    makeTexture(256, 1, true, (context, size) => {
      context.fillStyle = '#000000';
      context.fillRect(0, 0, size, size);
      const steps = 40;
      for (let step = 0; step < steps; step += 1) {
        const t = step / steps;
        const y = size * (1 - t) - size / steps;
        const halfWidth = (size / 2) * (0.22 + 0.68 * t ** 0.7);
        const strength = (1 - t) ** 1.8;
        const gradient = context.createLinearGradient(size / 2 - halfWidth, 0, size / 2 + halfWidth, 0);
        const level = Math.round(255 * strength);
        const color = `rgb(${level},${Math.round(level * 0.78)},${Math.round(level * 0.5)})`;
        gradient.addColorStop(0, 'rgb(0,0,0)');
        gradient.addColorStop(0.5, color);
        gradient.addColorStop(1, 'rgb(0,0,0)');
        context.fillStyle = gradient;
        context.fillRect(size / 2 - halfWidth, y, halfWidth * 2, size / steps + 1);
      }
    }),
  );
  texture.repeat.set(1 / WASH_WIDTH, 1 / WASH_HEIGHT);
  texture.offset.set(0.5, 0);
  return texture;
})();

/** 펜던트 아래 바닥에 고이는 둥근 빛. */
export const lightPoolTexture = (() => {
  const texture = clampLight(
    makeTexture(256, POOL_RADIUS * 2, true, (context, size) => {
      const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      gradient.addColorStop(0, 'rgb(255,190,120)');
      gradient.addColorStop(0.4, 'rgb(120,82,48)');
      gradient.addColorStop(1, 'rgb(0,0,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, size, size);
    }),
  );
  texture.offset.set(0.5, 0.5);
  return texture;
})();

// 라탄 등받이 ----------------------------------------------------------------

/** 가로·세로·대각선 등나무 줄이 엮인 망. 투명한 틈으로 뒤가 비친다. */
export const caneColor = makeTexture(256, 0.075, true, (context, size) => {
  context.clearRect(0, 0, size, size);
  context.lineCap = 'butt';
  const strand = (color: string, width: number, x1: number, y1: number, x2: number, y2: number) => {
    context.strokeStyle = color;
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
  };
  const light = '#d9ba84';
  const dark = '#b8935c';
  const half = size / 2;
  for (const offset of [0, half, size]) {
    strand(light, size * 0.1, 0, offset, size, offset);
    strand(light, size * 0.1, offset, 0, offset, size);
  }
  for (const shift of [-size, 0, size]) {
    strand(dark, size * 0.075, shift, 0, shift + size, size);
    strand(dark, size * 0.075, shift + size, 0, shift, size);
  }
});

// 벽 그림 --------------------------------------------------------------------

export const WALL_ART_WIDTH = 1.5;
export const WALL_ART_HEIGHT = 2;

/** 흙빛 아치와 태양을 겹친 추상화. 공간의 색을 벗어나지 않는다. */
export const wallArtColor = (() => {
  const texture = makeTexture(512, 1, true, (context, size) => {
    const random = seededRandom(1301);
    context.fillStyle = '#e8dcc8';
    context.fillRect(0, 0, size, size);
    const arch = (x: number, width: number, top: number, color: string) => {
      context.fillStyle = color;
      context.beginPath();
      context.moveTo(x - width / 2, size);
      context.lineTo(x - width / 2, top + width / 2);
      context.arc(x, top + width / 2, width / 2, Math.PI, 0);
      context.lineTo(x + width / 2, size);
      context.closePath();
      context.fill();
    };
    arch(size * 0.36, size * 0.5, size * 0.3, '#b9805a');
    arch(size * 0.66, size * 0.42, size * 0.46, '#7d6a54');
    arch(size * 0.42, size * 0.22, size * 0.62, '#efe3cf');
    context.fillStyle = '#c9a26a';
    context.beginPath();
    context.arc(size * 0.7, size * 0.2, size * 0.085, 0, Math.PI * 2);
    context.fill();
    // 붓 자국
    for (let stroke = 0; stroke < 700; stroke += 1) {
      context.fillStyle = `rgba(${random() > 0.5 ? '255,248,232' : '84,66,48'},${0.015 + random() * 0.04})`;
      context.fillRect(random() * size, random() * size, 8 + random() * 60, 1 + random() * 2);
    }
  });
  texture.repeat.set(1 / WALL_ART_WIDTH, 1 / WALL_ART_HEIGHT);
  texture.offset.set(0.5, 0);
  return texture;
})();
