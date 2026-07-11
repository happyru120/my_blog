// 이미지 리사이즈 + 압축 + GPS 위치정보(EXIF) 제거 + 워터마크
// 캔버스로 다시 인코딩하는 순간 EXIF(위치정보 포함)는 구조적으로 모두 사라진다.

import { createZip } from './mini-zip.js';

const NAVER_WIDTH = 966;

const $ = (id) => document.getElementById(id);

const els = {
  dropZone: $('dropZone'),
  fileInput: $('fileInput'),
  panelSettings: $('panel-settings'),
  panelList: $('panel-list'),
  optWidth: $('optWidth'),
  optFormat: $('optFormat'),
  optQuality: $('optQuality'),
  optWmOn: $('optWmOn'),
  optWmText: $('optWmText'),
  optWmPos: $('optWmPos'),
  convertBtn: $('convertBtn'),
  progressWrap: $('progressWrap'),
  progressLabel: $('progressLabel'),
  progressPct: $('progressPct'),
  progressBarFill: $('progressBarFill'),
  imgList: $('imgList'),
  listSummary: $('listSummary'),
  zipBtn: $('zipBtn'),
  writeBtn: $('writeBtn'),
  clearBtn: $('clearBtn'),
};

// { file, hadGps, el, thumbURL, result: {blob, url, name, outW, outH} | null }
let items = [];

/* ---------------- 파일 추가 ---------------- */

els.dropZone.addEventListener('click', () => els.fileInput.click());
els.fileInput.addEventListener('change', () => {
  addFiles([...els.fileInput.files]);
  els.fileInput.value = '';
});

['dragover', 'dragenter'].forEach((ev) =>
  els.dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    els.dropZone.classList.add('dragover');
  })
);
['dragleave', 'drop'].forEach((ev) =>
  els.dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    els.dropZone.classList.remove('dragover');
  })
);
els.dropZone.addEventListener('drop', (e) => addFiles([...e.dataTransfer.files]));

els.optWmOn.addEventListener('change', () => {
  els.optWmText.disabled = els.optWmPos.disabled = !els.optWmOn.checked;
  if (els.optWmOn.checked) els.optWmText.focus();
});

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
    detectGps(file).then((has) => {
      item.hadGps = has;
      updateItemBadges(item);
    });
  }

  els.panelSettings.classList.remove('hidden');
  els.panelList.classList.remove('hidden');
  els.listSummary.classList.add('hidden');
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
    URL.revokeObjectURL(it.thumbURL);
    if (it.result) URL.revokeObjectURL(it.result.url);
  });
  items = [];
  els.imgList.innerHTML = '';
  els.listSummary.classList.add('hidden');
  els.zipBtn.classList.add('hidden');
  els.writeBtn.classList.add('hidden');
  els.panelList.classList.add('hidden');
  els.panelSettings.classList.add('hidden');
});

async function convertAll() {
  if (!items.length) return;
  els.convertBtn.disabled = true;

  const maxWidth = +els.optWidth.value; // 0 = 원본 유지
  const format = els.optFormat.value;
  const quality = +els.optQuality.value;
  const watermark = els.optWmOn.checked ? {
    text: els.optWmText.value.trim(),
    pos: els.optWmPos.value,
  } : null;

  let done = 0;
  let failed = 0;
  for (const item of items) {
    showProgress(`변환 중… (${done + 1}/${items.length})`, (done / items.length) * 100);
    try {
      item.result = await processImage(item.file, { maxWidth, format, quality, watermark });
      updateItemDone(item);
    } catch (err) {
      console.error(item.file.name, err);
      failed++;
      item.el.querySelector('.img-detail').textContent = '⚠ 변환 실패 — 지원하지 않는 형식이에요';
    }
    done++;
  }
  showProgress('완료!', 100);
  setTimeout(hideProgress, 600);

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

  if (watermark && watermark.text) drawWatermark(ctx, outW, outH, watermark);

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

  const zip = createZip(entries);
  const url = URL.createObjectURL(zip);
  const a = document.createElement('a');
  a.href = url;
  a.download = `블로그사진_${entries.length}장.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  els.zipBtn.disabled = false;
});

/* ---------------- 진행률 & 유틸 ---------------- */

function showProgress(label, pct) {
  els.progressWrap.classList.remove('hidden');
  els.progressLabel.textContent = label;
  const v = Math.min(100, Math.round(pct));
  els.progressPct.textContent = `${v}%`;
  els.progressBarFill.style.width = `${v}%`;
}

function hideProgress() {
  els.progressWrap.classList.add('hidden');
  els.progressBarFill.style.width = '0%';
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + 'MB';
  if (bytes >= 1024) return Math.round(bytes / 1024) + 'KB';
  return bytes + 'B';
}
