// 썸네일 메이커 — 800×800 캔버스에 사진 + 제목을 얹어 대표 이미지를 만든다.

import { $ } from './utils.js';

const SIZE = 800;

const els = {
  canvas: $('canvas'),
  fileInput: $('fileInput'),
  pickImageBtn: $('pickImageBtn'),
  zoomRange: $('zoomRange'),
  dimRange: $('dimRange'),
  bgColor: $('bgColor'),
  titleText: $('titleText'),
  fontSize: $('fontSize'),
  textColor: $('textColor'),
  textPos: $('textPos'),
  textStyle: $('textStyle'),
  downloadBtn: $('downloadBtn'),
};

const ctx = els.canvas.getContext('2d');

const state = {
  image: null,      // ImageBitmap
  zoom: 1,
  offsetX: 0,       // 이미지 중심 이동량 (캔버스 px)
  offsetY: 0,
};

/* ---------------- 이미지 불러오기 ---------------- */

els.pickImageBtn.addEventListener('click', () => els.fileInput.click());

els.fileInput.addEventListener('change', async () => {
  const file = els.fileInput.files[0];
  els.fileInput.value = '';
  if (!file) return;
  try {
    if (state.image) state.image.close();
    state.image = await createImageBitmap(file);
    state.zoom = 1;
    state.offsetX = 0;
    state.offsetY = 0;
    els.zoomRange.value = 1;
    els.zoomRange.disabled = false;
    render();
  } catch {
    alert('이미지를 불러오지 못했어요. JPG/PNG 파일을 사용해 주세요.');
  }
});

/* ---------------- 드래그로 위치 이동 ---------------- */

let dragging = null;

els.canvas.addEventListener('pointerdown', (e) => {
  if (!state.image) return;
  els.canvas.setPointerCapture(e.pointerId);
  dragging = { x: e.clientX, y: e.clientY, ox: state.offsetX, oy: state.offsetY };
});

els.canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const rect = els.canvas.getBoundingClientRect();
  const scale = SIZE / rect.width; // 화면 px → 캔버스 px
  state.offsetX = dragging.ox + (e.clientX - dragging.x) * scale;
  state.offsetY = dragging.oy + (e.clientY - dragging.y) * scale;
  clampOffset();
  render();
});

['pointerup', 'pointercancel'].forEach((ev) =>
  els.canvas.addEventListener(ev, () => { dragging = null; })
);

/* ---------------- 컨트롤 ---------------- */

els.zoomRange.addEventListener('input', () => {
  state.zoom = +els.zoomRange.value;
  clampOffset();
  render();
});

[els.dimRange, els.bgColor, els.titleText, els.fontSize, els.textColor, els.textPos, els.textStyle]
  .forEach((el) => el.addEventListener('input', render));

// cover 배치 기준 이미지 그리기 크기
function coverSize() {
  const img = state.image;
  const base = Math.max(SIZE / img.width, SIZE / img.height) * state.zoom;
  return { w: img.width * base, h: img.height * base };
}

// 이미지가 캔버스 밖으로 밀려 빈 여백이 생기지 않게 오프셋 제한
function clampOffset() {
  if (!state.image) return;
  const { w, h } = coverSize();
  const maxX = (w - SIZE) / 2;
  const maxY = (h - SIZE) / 2;
  state.offsetX = Math.max(-maxX, Math.min(maxX, state.offsetX));
  state.offsetY = Math.max(-maxY, Math.min(maxY, state.offsetY));
}

/* ---------------- 렌더링 ---------------- */

function render() {
  ctx.clearRect(0, 0, SIZE, SIZE);

  if (state.image) {
    const { w, h } = coverSize();
    ctx.drawImage(state.image, (SIZE - w) / 2 + state.offsetX, (SIZE - h) / 2 + state.offsetY, w, h);
  } else {
    ctx.fillStyle = els.bgColor.value;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }

  const dim = +els.dimRange.value / 100;
  if (dim > 0) {
    ctx.fillStyle = `rgba(0,0,0,${dim})`;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }

  drawTitle();
}

function drawTitle() {
  const raw = els.titleText.value.trimEnd();
  if (!raw) return;
  const lines = raw.split('\n').slice(0, 4);
  const fontSize = +els.fontSize.value;
  const lineHeight = fontSize * 1.35;
  const style = els.textStyle.value;
  const pos = els.textPos.value;

  ctx.font = `800 ${fontSize}px "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const blockH = lines.length * lineHeight;
  const pad = SIZE * 0.1;
  let centerY;
  if (pos === 't') centerY = pad + blockH / 2;
  else if (pos === 'b') centerY = SIZE - pad - blockH / 2;
  else centerY = SIZE / 2;

  // 반투명 배경 박스
  if (style === 'box') {
    const maxW = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const boxPad = fontSize * 0.5;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    roundRect(ctx,
      SIZE / 2 - maxW / 2 - boxPad,
      centerY - blockH / 2 - boxPad * 0.6,
      maxW + boxPad * 2,
      blockH + boxPad * 1.2,
      fontSize * 0.3);
    ctx.fill();
  }

  ctx.save();
  if (style === 'shadow') {
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = fontSize * 0.18;
    ctx.shadowOffsetY = fontSize * 0.05;
  }

  lines.forEach((line, i) => {
    const y = centerY - blockH / 2 + lineHeight * (i + 0.5);
    if (style === 'outline') {
      ctx.strokeStyle = 'rgba(0,0,0,.8)';
      ctx.lineWidth = fontSize / 9;
      ctx.lineJoin = 'round';
      ctx.strokeText(line, SIZE / 2, y);
    }
    ctx.fillStyle = els.textColor.value;
    ctx.fillText(line, SIZE / 2, y);
  });
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------------- 저장 ---------------- */

els.downloadBtn.addEventListener('click', () => {
  els.canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '블로그_썸네일_800x800.jpg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }, 'image/jpeg', 0.92);
});

// 웹폰트 로딩이 끝나면 다시 그려 제목 폰트를 반영
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(render);
}

render();
