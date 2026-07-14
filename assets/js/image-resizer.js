// 이미지 리사이즈 + 압축 + GPS 위치정보(EXIF) 제거 + 워터마크
// 캔버스로 다시 인코딩하는 순간 EXIF(위치정보 포함)는 구조적으로 모두 사라진다.

import { createZip } from './mini-zip.js';
import { $, formatSize, initDropZone, createProgress } from './utils.js';

const NAVER_WIDTH = 966;

const els = {
  dropZone: $('dropZone'),
  fileInput: $('fileInput'),
  panelSettings: $('panel-settings'),
  panelList: $('panel-list'),
  optWidth: $('optWidth'),
  optFormat: $('optFormat'),
  optQuality: $('optQuality'),
  optWmOn: $('optWmOn'),
  optWmType: $('optWmType'),
  optWmText: $('optWmText'),
  optWmPos: $('optWmPos'),
  wmImgBtn: $('wmImgBtn'),
  wmImgInput: $('wmImgInput'),
  convertBtn: $('convertBtn'),
  imgList: $('imgList'),
  listSummary: $('listSummary'),
  zipBtn: $('zipBtn'),
  writeBtn: $('writeBtn'),
  clearBtn: $('clearBtn'),
};

// { file, hadGps, gpsPromise, el, thumbURL, result: {blob, url, name, outW, outH} | null }
let items = [];

const progress = createProgress();

/* ---------------- 파일 추가 ---------------- */

initDropZone(els.dropZone, els.fileInput, addFiles);

els.optWmOn.addEventListener('change', () => {
  $('wmOptions').classList.toggle('hidden', !els.optWmOn.checked);
  if (els.optWmOn.checked && els.optWmType.value === 'text') els.optWmText.focus();
  updateWmPreview();
});
els.optWmText.addEventListener('input', updateWmPreview);
els.optWmPos.addEventListener('change', updateWmPreview);

// 워터마크 종류 전환: 글자 서명 ↔ 이미지 로고
els.optWmType.addEventListener('change', () => {
  const isImage = els.optWmType.value === 'image';
  els.optWmText.classList.toggle('hidden', isImage);
  els.wmImgBtn.classList.toggle('hidden', !isImage);
  if (isImage && !wmLogo) els.wmImgInput.click(); // 처음 고르면 바로 파일 선택창
  updateWmPreview();
});

let wmLogo = null; // { name, bitmap } — 투명 배경(PNG)이 그대로 유지된다

els.wmImgBtn.addEventListener('click', () => els.wmImgInput.click());

els.wmImgInput.addEventListener('change', async () => {
  const file = els.wmImgInput.files[0];
  els.wmImgInput.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert('이미지 파일을 선택해 주세요. (투명 배경은 PNG)');
    return;
  }
  try {
    const bitmap = await createImageBitmap(file);
    if (wmLogo) wmLogo.bitmap.close();
    wmLogo = { name: file.name, bitmap };
    els.wmImgBtn.textContent = file.name;
    els.wmImgBtn.classList.add('has-logo');
    updateWmPreview();
  } catch {
    alert('로고 이미지를 읽지 못했어요. PNG 파일을 권장합니다.');
  }
});

/* ---------------- 워터마크 실시간 미리보기 ---------------- */
// 첫 번째 사진 위에 지금 설정대로 워터마크를 그려서 바로 보여준다.
// drawWatermark의 글자 크기는 폭에 비례하므로 축소 미리보기도 실제 저장본과 같은 비율이다.

let wmPreviewSrc = null;    // 미리보기 비트맵의 원본 파일 (바뀌면 다시 디코딩)
let wmPreviewBitmap = null;

async function updateWmPreview() {
  const wrap = $('wmPreviewWrap');
  if (!els.optWmOn.checked || !items.length) {
    wrap.classList.add('hidden');
    return;
  }

  const file = items[0].file;
  if (wmPreviewSrc !== file) {
    wmPreviewSrc = file;
    if (wmPreviewBitmap) wmPreviewBitmap.close();
    wmPreviewBitmap = null;
    try {
      const full = await createImageBitmap(file);
      // 미리보기용으로 작게 줄여서 보관 (캔버스 축소 — iOS Safari 포함 모든 브라우저 지원)
      const w = Math.min(840, full.width);
      const h = Math.round(full.height * (w / full.width));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const cctx = c.getContext('2d');
      cctx.imageSmoothingQuality = 'high';
      cctx.drawImage(full, 0, 0, w, h);
      full.close();
      wmPreviewBitmap = await createImageBitmap(c);
    } catch {
      wrap.classList.add('hidden');
      return;
    }
    if (wmPreviewSrc !== file) return; // 그 사이 파일이 바뀌었으면 무시
  }
  if (!wmPreviewBitmap) return;

  const canvas = $('wmPreviewCanvas');
  canvas.width = wmPreviewBitmap.width;
  canvas.height = wmPreviewBitmap.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(wmPreviewBitmap, 0, 0);

  const pos = els.optWmPos.value;
  if (els.optWmType.value === 'image') {
    if (wmLogo) drawWatermarkImage(ctx, canvas.width, canvas.height, { bitmap: wmLogo.bitmap, pos });
  } else {
    const typed = els.optWmText.value.trim();
    ctx.globalAlpha = typed ? 1 : 0.55; // 아직 안 썼으면 예시임을 흐리게 표시
    drawWatermark(ctx, canvas.width, canvas.height, { text: typed || 'ⓒ내블로그닉네임', pos });
    ctx.globalAlpha = 1;
  }

  wrap.classList.remove('hidden');
}

async function addFiles(files) {
  const images = files.filter((f) => f.type.startsWith('image/'));
  if (!images.length) {
    alert('이미지 파일을 선택해 주세요. (JPG, PNG, WebP 등)');
    return;
  }

  for (const file of images) {
    const item = { file, hadGps: false, el: null, thumbURL: URL.createObjectURL(file), result: null };
    item.el = renderItem(item);
    items.push(item);
    // 감지 결과를 배지에 반영하고, 변환 시 완료를 보장할 수 있게 프로미스를 보관
    item.gpsPromise = detectGps(file).then((has) => {
      item.hadGps = has;
      updateItemBadges(item);
    });
  }

  els.panelSettings.classList.remove('hidden');
  els.panelList.classList.remove('hidden');
  els.listSummary.classList.add('hidden');
  updateWmPreview();
}

function renderItem(item) {
  const el = document.createElement('div');
  el.className = 'img-item';
  el.innerHTML = `
    <img class="img-thumb" alt="">
    <div class="img-info">
      <div class="img-name"></div>
      <div class="img-detail"></div>
      <div class="img-badges"></div>
    </div>
    <a class="btn btn-secondary btn-mini hidden" download>저장</a>`;
  el.querySelector('.img-thumb').src = item.thumbURL;
  el.querySelector('.img-name').textContent = item.file.name;
  el.querySelector('.img-detail').textContent = `${formatSize(item.file.size)} · 변환 대기 중`;
  els.imgList.appendChild(el);
  return el;
}

function updateItemBadges(item) {
  const box = item.el.querySelector('.img-badges');
  box.innerHTML = '';
  if (item.result && item.hadGps) {
    box.insertAdjacentHTML('beforeend', '<span class="badge badge-ok">🔒 위치정보 제거됨</span>');
  } else if (!item.result && item.hadGps) {
    box.insertAdjacentHTML('beforeend', '<span class="badge badge-warn">📍 위치정보 있음</span>');
  }
}

/* ---------------- 변환 ---------------- */

els.convertBtn.addEventListener('click', convertAll);

els.clearBtn.addEventListener('click', () => {
  items.forEach((it) => {
    if (it.thumbURL) URL.revokeObjectURL(it.thumbURL);
    if (it.result) URL.revokeObjectURL(it.result.url);
  });
  items = [];
  els.imgList.innerHTML = '';
  els.listSummary.classList.add('hidden');
  els.zipBtn.classList.add('hidden');
  els.writeBtn.classList.add('hidden');
  els.panelList.classList.add('hidden');
  els.panelSettings.classList.add('hidden');
  updateWmPreview(); // 목록이 비면 미리보기도 숨긴다
});

async function convertAll() {
  if (!items.length) return;
  if (els.optWmOn.checked) {
    if (els.optWmType.value === 'image' && !wmLogo) {
      alert('워터마크로 쓸 로고 이미지를 선택해 주세요. (투명 배경은 PNG)');
      els.wmImgInput.click();
      return;
    }
    if (els.optWmType.value === 'text' && !els.optWmText.value.trim()) {
      alert('워터마크 문구를 입력해 주세요. (예: ⓒ내블로그닉네임)');
      els.optWmText.focus();
      return;
    }
  }
  els.convertBtn.disabled = true;

  // GPS 감지가 끝나기 전에 변환하면 '위치정보 제거' 집계가 빠질 수 있으므로 완료를 기다린다 (수 ms 수준)
  await Promise.all(items.map((it) => it.gpsPromise));

  const maxWidth = +els.optWidth.value; // 0 = 원본 유지
  const format = els.optFormat.value;
  const quality = +els.optQuality.value;
  const watermark = els.optWmOn.checked ? {
    mode: els.optWmType.value,
    text: els.optWmText.value.trim(),
    bitmap: wmLogo ? wmLogo.bitmap : null,
    pos: els.optWmPos.value,
  } : null;

  let done = 0;
  let failed = 0;
  for (const item of items) {
    progress.show(`변환 중… (${done + 1}/${items.length})`, (done / items.length) * 100);
    try {
      if (item.result) URL.revokeObjectURL(item.result.url); // 재변환 시 이전 결과 URL 누수 방지
      item.result = await processImage(item.file, { maxWidth, format, quality, watermark });
      updateItemDone(item);
    } catch (err) {
      console.error(item.file.name, err);
      failed++;
      item.el.querySelector('.img-detail').textContent = '⚠ 변환 실패 — 지원하지 않는 형식이에요';
    }
    done++;
  }
  progress.show('완료!', 100);
  setTimeout(() => progress.hide(), 600);

  const doneItems = items.filter((it) => it.result);
  const before = doneItems.reduce((s, it) => s + it.file.size, 0);
  const after = doneItems.reduce((s, it) => s + it.result.blob.size, 0);
  const gpsCount = doneItems.filter((it) => it.hadGps).length;
  const savePct = before > 0 ? Math.max(0, Math.round((1 - after / before) * 100)) : 0;

  els.listSummary.className = 'result-verdict ok';
  els.listSummary.textContent =
    `✅ ${doneItems.length}장 완료 · ${formatSize(before)} → ${formatSize(after)} (${savePct}% 절약)` +
    (gpsCount ? ` · 위치정보 ${gpsCount}장 제거` : '') +
    (failed ? ` · 실패 ${failed}장` : '');
  els.listSummary.classList.remove('hidden');

  els.zipBtn.classList.toggle('hidden', doneItems.length < 2);
  els.writeBtn.classList.remove('hidden');
  els.convertBtn.disabled = false;
}

function updateItemDone(item) {
  const r = item.result;
  item.el.querySelector('.img-thumb').src = r.url;
  if (item.thumbURL) { // 원본 미리보기 URL은 더 이상 필요 없으므로 해제
    URL.revokeObjectURL(item.thumbURL);
    item.thumbURL = null;
  }
  item.el.querySelector('.img-detail').innerHTML =
    `${r.srcW}×${r.srcH} → <strong>${r.outW}×${r.outH}</strong> · ` +
    `${formatSize(item.file.size)} → <strong class="size-ok">${formatSize(r.blob.size)}</strong>`;
  const saveBtn = item.el.querySelector('a.btn-mini');
  saveBtn.href = r.url;
  saveBtn.download = r.name;
  saveBtn.classList.remove('hidden');
  updateItemBadges(item);
}

async function processImage(file, { maxWidth, format, quality, watermark }) {
  const bitmap = await createImageBitmap(file); // 브라우저가 EXIF 회전을 반영해 디코딩
  const srcW = bitmap.width;
  const srcH = bitmap.height;

  const targetW = maxWidth > 0 ? Math.min(maxWidth, srcW) : srcW; // 확대는 하지 않음
  const scale = targetW / srcW;
  const outW = Math.round(srcW * scale);
  const outH = Math.round(srcH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, outW, outH);
  bitmap.close();

  if (watermark) {
    if (watermark.mode === 'image' && watermark.bitmap) {
      drawWatermarkImage(ctx, outW, outH, watermark);
    } else if (watermark.text) {
      drawWatermark(ctx, outW, outH, watermark);
    }
  }

  let outType = format;
  if (format === 'auto') {
    outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  }

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('인코딩 실패'))), outType, quality);
  });

  const ext = outType === 'image/png' ? 'png' : 'jpg';
  const base = file.name.replace(/\.[^.]+$/, '');
  return {
    blob,
    url: URL.createObjectURL(blob),
    name: `${base}_${outW}px.${ext}`,
    srcW, srcH, outW, outH,
  };
}

function drawWatermark(ctx, w, h, { text, pos }) {
  const fontSize = Math.max(14, Math.round(w * 0.032));
  const pad = Math.round(w * 0.025);
  ctx.font = `600 ${fontSize}px Pretendard, "Apple SD Gothic Neo", sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,.78)';
  ctx.strokeStyle = 'rgba(0,0,0,.35)';
  ctx.lineWidth = Math.max(1, fontSize / 10);
  ctx.lineJoin = 'round';

  let x, y;
  if (pos === 'c') {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    x = w / 2; y = h / 2;
  } else {
    ctx.textAlign = pos.includes('r') ? 'right' : 'left';
    ctx.textBaseline = pos.includes('b') ? 'bottom' : 'top';
    x = pos.includes('r') ? w - pad : pad;
    y = pos.includes('b') ? h - pad : pad;
  }
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

// 이미지 로고 워터마크: 사진 폭의 18% 크기로 배치 (PNG 투명 배경 유지)
function drawWatermarkImage(ctx, w, h, { bitmap, pos }) {
  const pad = Math.round(w * 0.025);
  const logoW = Math.max(24, Math.round(w * 0.18));
  const logoH = Math.max(1, Math.round(bitmap.height * (logoW / bitmap.width)));

  let x, y;
  if (pos === 'c') {
    x = (w - logoW) / 2;
    y = (h - logoH) / 2;
  } else {
    x = pos.includes('r') ? w - pad - logoW : pad;
    y = pos.includes('b') ? h - pad - logoH : pad;
  }
  ctx.globalAlpha = 0.88; // 은은하게 — 로고 자체 투명도와 곱해진다
  ctx.drawImage(bitmap, x, y, logoW, logoH);
  ctx.globalAlpha = 1;
}

/* ---------------- GPS(EXIF) 감지 ---------------- */
// JPEG APP1(Exif) 세그먼트의 IFD0에서 GPS IFD 포인터(0x8825) 존재 여부만 확인한다.
async function detectGps(file) {
  if (file.type !== 'image/jpeg') return false;
  try {
    const buf = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return false;

    let o = 2;
    while (o + 4 < buf.length) {
      if (buf[o] !== 0xff) break;
      const marker = buf[o + 1];
      if (marker === 0xda) break; // 이미지 데이터 시작
      const len = (buf[o + 2] << 8) | buf[o + 3];

      if (marker === 0xe1 &&
          buf[o+4] === 0x45 && buf[o+5] === 0x78 && buf[o+6] === 0x69 && buf[o+7] === 0x66 && // "Exif"
          buf[o+8] === 0 && buf[o+9] === 0) {
        const t = o + 10; // TIFF 헤더 시작
        const little = buf[t] === 0x49;
        const u16 = (p) => little ? buf[p] | (buf[p+1] << 8) : (buf[p] << 8) | buf[p+1];
        const u32 = (p) => little
          ? (buf[p] | (buf[p+1] << 8) | (buf[p+2] << 16) | (buf[p+3] << 24)) >>> 0
          : ((buf[p] << 24) | (buf[p+1] << 16) | (buf[p+2] << 8) | buf[p+3]) >>> 0;

        const ifd0 = t + u32(t + 4);
        if (ifd0 + 2 > buf.length) return false;
        const n = u16(ifd0);
        for (let i = 0; i < n; i++) {
          const entry = ifd0 + 2 + i * 12;
          if (entry + 12 > buf.length) return false;
          if (u16(entry) === 0x8825) return true; // GPS IFD 포인터
        }
        return false;
      }
      o += 2 + len;
    }
  } catch { /* 감지 실패는 없음으로 처리 */ }
  return false;
}

/* ---------------- ZIP 저장 ---------------- */

els.zipBtn.addEventListener('click', async () => {
  const doneItems = items.filter((it) => it.result);
  if (!doneItems.length) return;

  els.zipBtn.disabled = true;
  const entries = [];
  const usedNames = new Set();
  for (const it of doneItems) {
    let name = it.result.name;
    let n = 2;
    while (usedNames.has(name)) {
      name = it.result.name.replace(/(\.[^.]+)$/, ` (${n++})$1`);
    }
    usedNames.add(name);
    entries.push({ name, data: new Uint8Array(await it.result.blob.arrayBuffer()) });
  }

  try {
    const zip = createZip(entries);
    const url = URL.createObjectURL(zip);
    const a = document.createElement('a');
    a.href = url;
    a.download = `블로그사진_${entries.length}장.zip`;
    a.click();
    // 느린 연결에서도 다운로드가 끊기지 않게 넉넉히 뒤에 해제 (페이지를 닫으면 자동 해제됨)
    setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
  } catch (err) {
    alert('ZIP을 만들지 못했어요: ' + (err && err.message ? err.message : err));
  } finally {
    els.zipBtn.disabled = false;
  }
});

