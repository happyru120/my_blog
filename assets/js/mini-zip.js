// 압축 없이(store) 파일을 묶는 최소 ZIP 생성기.
// 이미지 파일은 이미 압축돼 있어 deflate가 의미 없으므로 store 방식으로 충분하다.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// entries: [{ name: string, data: Uint8Array }] → ZIP Blob
export function createZip(entries) {
  // ZIP64 미지원 포맷의 한계 — 초과 시 조용히 깨진 파일을 만들지 않도록 명시적으로 실패시킨다
  if (entries.length > 0xffff) {
    throw new Error(`파일이 너무 많아요 (최대 65,535개, 현재 ${entries.length}개)`);
  }
  const total = entries.reduce((s, e) => s + e.data.length, 0);
  if (total > 0xffffffff) {
    throw new Error('전체 용량이 4GB를 넘어 ZIP으로 묶을 수 없어요. 나눠서 저장해 주세요.');
  }

  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;

  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  for (const { name, data } of entries) {
    const nameBytes = enc.encode(name);
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);  // local file header signature
    local.setUint16(4, 20, true);          // version needed
    local.setUint16(6, 0x0800, true);      // UTF-8 filename flag
    local.setUint16(8, 0, true);           // store (no compression)
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    parts.push(local.buffer, nameBytes, data);

    const cent = new DataView(new ArrayBuffer(46));
    cent.setUint32(0, 0x02014b50, true);   // central directory signature
    cent.setUint16(4, 20, true);
    cent.setUint16(6, 20, true);
    cent.setUint16(8, 0x0800, true);
    cent.setUint16(10, 0, true);
    cent.setUint16(12, dosTime, true);
    cent.setUint16(14, dosDate, true);
    cent.setUint32(16, crc, true);
    cent.setUint32(20, data.length, true);
    cent.setUint32(24, data.length, true);
    cent.setUint16(28, nameBytes.length, true);
    cent.setUint32(42, offset, true);      // local header offset
    central.push(cent.buffer, nameBytes);

    offset += 30 + nameBytes.length + data.length;
  }

  const centralSize = central.reduce((s, b) => s + b.byteLength, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);     // end of central directory
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, offset, true);
  return new Blob([...parts, ...central, eocd.buffer], { type: 'application/zip' });
}
