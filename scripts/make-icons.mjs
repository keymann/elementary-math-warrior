/**
 * PWA 아이콘 생성 — 의존성 없이 순수 zlib 로 PNG 를 쓴다.
 * 디자인 확정 전까지 쓰는 플레이스홀더다(연필 모양 + 초록 배경).
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function png(size, path) {
  const px = (x, y) => {
    const cx = size / 2, cy = size / 2;
    const r = size * 0.46;
    const inCircle = (x - cx) ** 2 + (y - cy) ** 2 < r * r;
    if (!inCircle) return [0, 0, 0, 0];

    // 대각선 연필: 굵은 노란 띠 + 끝에 짙은 심
    const u = (x - y) / size;            // -1..1 대각 좌표
    const v = (x + y) / size;            // 0..2
    const band = Math.abs(u) < 0.115;
    const tip = band && v > 1.34;
    const eraser = band && v < 0.62;
    if (tip) return [60, 44, 30, 255];
    if (eraser) return [235, 120, 120, 255];
    if (band) return [255, 209, 102, 255];
    return [55, 178, 77, 255];           // 배경 초록
  };

  const raw = Buffer.alloc((size * 4 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = px(x, y);
      raw[o++] = r; raw[o++] = g; raw[o++] = b; raw[o++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  const out = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(path, out);
  console.log(path, out.length, 'bytes');
}

png(192, 'public/icon-192.png');
png(512, 'public/icon-512.png');
png(180, 'public/apple-touch-icon.png');
