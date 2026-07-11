// GIF 인코딩 전용 Web Worker.
// 메인 스레드에서 RGBA 프레임 버퍼를 받아 gifenc으로 인코딩한다.
import { GIFEncoder, quantize, applyPalette } from './gifenc.esm.js';

self.onmessage = (e) => {
  const { frames, width, height, delay, maxColors } = e.data;
  try {
    const gif = GIFEncoder();
    const total = frames.length;

    for (let i = 0; i < total; i++) {
      const rgba = new Uint8Array(frames[i]);
      const palette = quantize(rgba, maxColors);
      const indexed = applyPalette(rgba, palette);
      gif.writeFrame(indexed, width, height, { palette, delay, repeat: 0 });

      if (i % 3 === 0 || i === total - 1) {
        self.postMessage({ type: 'progress', done: i + 1, total });
      }
    }

    gif.finish();
    const bytes = gif.bytes();
    self.postMessage({ type: 'done', buffer: bytes.buffer }, [bytes.buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
  }
};
