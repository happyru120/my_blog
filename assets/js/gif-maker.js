// 영상 → GIF 변환기 (네이버 블로그 기준 자동 압축)
// 모든 처리는 브라우저 안에서만 이루어진다.

import { $, formatSize, formatTime, initDropZone, createProgress } from './utils.js';

const NAVER_LIMIT = 10 * 1024 * 1024;      // 네이버 블로그 GIF 용량 제한 10MB
const NAVER_MAX_WIDTH = 966;               // 본문 최대 폭 — 초과 시 네이버가 재변환하며 움직임이 사라질 수 있음
const SIZE_TARGET = NAVER_LIMIT * 0.97;    // 안전 여유분을 둔 압축 목표
const MAX_FRAMES = 240;                    // 메모리 보호용 프레임 상한
const MAX_ATTEMPTS = 6;                    // 자동 압축 재시도 횟수
const MIN_GAP = 0.1;                       // 시작·끝 사이 최소 간격 (초)
const THUMB_COUNT = 24;                    // 타임라인 필름스트립 썸네일 수

const els = {
  dropZone: $('dropZone'),
  fileInput: $('fileInput'),
  video: $('video'),
  fileMeta: $('fileMeta'),
  panelTrim: $('panel-trim'),
  panelSettings: $('panel-settings'),
  panelResult: $('panel-result'),
  editorStage: $('editorStage'),
  timeline: $('timeline'),
  tlCanvas: $('tlCanvas'),
  tlDimL: $('tlDimL'),
  tlDimR: $('tlDimR'),
  tlSelection: $('tlSelection'),
  tlHandleL: $('tlHandleL'),
  tlHandleR: $('tlHandleR'),
  tlPlayhead: $('tlPlayhead'),
  playBtn: $('playBtn'),
  loopBtn: $('loopBtn'),
  jumpStartBtn: $('jumpStartBtn'),
  frameBackBtn: $('frameBackBtn'),
  frameFwdBtn: $('frameFwdBtn'),
  setStartBtn: $('setStartBtn'),
  setEndBtn: $('setEndBtn'),
  changeVideoBtn: $('changeVideoBtn'),
  curTime: $('curTime'),
  totalTime: $('totalTime'),
  selRangeLabel: $('selRangeLabel'),
  trimDuration: $('trimDuration'),
  trimWarn: $('trimWarn'),
  optWidth: $('optWidth'),
  optFps: $('optFps'),
  optColors: $('optColors'),
  optSpeed: $('optSpeed'),
  optAutoCompress: $('optAutoCompress'),
  makeBtn: $('makeBtn'),
  resultImg: $('resultImg'),
  resultVerdict: $('resultVerdict'),
  statSize: $('statSize'),
  statDim: $('statDim'),
  statLen: $('statLen'),
  statFrames: $('statFrames'),
  downloadBtn: $('downloadBtn'),
  retryBtn: $('retryBtn'),
  sizeGaugeFill: $('sizeGaugeFill'),
  sizeGaugeUsed: $('sizeGaugeUsed'),
};

let currentFile = null;
let videoURL = null;
let resultURL = null;
let busy = false; // 변환 중 편집·파일 교체 방지

// 편집기 상태: 선택 구간과 재생 모드
const edit = { dur: 0, start: 0, end: 0, loop: true };
let thumbToken = 0;     // 파일 교체 시 진행 중인 썸네일 생성을 무효화
let thumbBitmaps = [];  // 필름스트립 썸네일 (고정 개수, 리사이즈 시 다시 그림)

const progress = createProgress();
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ---------------- 파일 선택 ---------------- */

initDropZone(els.dropZone, els.fileInput, (files) => loadVideo(files[0]));

function loadVideo(file) {
  if (busy) {
    alert('지금 GIF를 만드는 중이에요. 끝난 뒤에 새 영상을 올려 주세요.');
    return;
  }
  if (!file.type.startsWith('video/') && !/\.(mp4|webm|mov|m4v)$/i.test(file.name)) {
    alert('영상 파일을 선택해 주세요. (MP4, WebM, MOV 등)');
    return;
  }
  currentFile = file;
  if (videoURL) URL.revokeObjectURL(videoURL);
  videoURL = URL.createObjectURL(file);

  const video = els.video;
  video.src = videoURL;
  video.muted = true;

  video.onloadedmetadata = () => {
    if (!video.videoWidth || !isFinite(video.duration)) {
      alert('이 영상은 브라우저에서 재생할 수 없는 형식이에요. MP4(H.264) 파일을 권장합니다.');
      return;
    }
    edit.dur = video.duration;
    edit.start = 0;
    edit.end = Math.min(edit.dur, 6); // 움짤은 짧게가 기본
    video.playbackRate = +els.optSpeed.value;

    // 세로 영상은 넓은 화면에서 미리보기·타임라인을 좌우로 배치
    els.editorStage.classList.toggle('stage-portrait', video.videoHeight > video.videoWidth);

    els.totalTime.textContent = formatTime(edit.dur);
    els.fileMeta.textContent =
      `${file.name} · ${video.videoWidth}×${video.videoHeight} · ${formatTime(edit.dur)} · ${formatSize(file.size)}`;

    els.panelTrim.classList.remove('hidden');
    els.panelSettings.classList.remove('hidden');
    els.panelResult.classList.add('hidden');
    els.panelTrim.scrollIntoView({ behavior: 'smooth', block: 'start' });

    updateEditorUI();
    buildThumbnails();
  };

  video.onerror = () => {
    alert('영상을 불러오지 못했어요. MP4(H.264) 파일을 권장합니다.');
  };
}

// 지금 영상을 지우고 바로 새 영상을 고를 수 있게 파일 선택창을 연다
els.changeVideoBtn.addEventListener('click', () => {
  if (busy) {
    alert('지금 GIF를 만드는 중이에요. 끝난 뒤에 바꿔 주세요.');
    return;
  }
  removeVideo();
  els.fileInput.click();
});

function removeVideo() {
  const video = els.video;
  video.pause();
  video.onloadedmetadata = null;
  video.onerror = null;
  video.removeAttribute('src');
  video.load();

  thumbToken++; // 진행 중인 썸네일 생성 중단
  thumbBitmaps = [];
  edit.dur = 0;
  edit.start = 0;
  edit.end = 0;
  currentFile = null;
  if (videoURL) {
    URL.revokeObjectURL(videoURL);
    videoURL = null;
  }

  els.panelTrim.classList.add('hidden');
  els.panelSettings.classList.add('hidden');
  els.panelResult.classList.add('hidden');
  els.dropZone.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ---------------- 타임라인 필름스트립 ---------------- */

// 별도의 숨은 video 엘리먼트로 썸네일을 뽑는다 — 사용자가 스크럽하는 본 플레이어와 충돌하지 않게
async function buildThumbnails() {
  const token = ++thumbToken;
  thumbBitmaps = [];
  drawThumbStrip();

  const tv = document.createElement('video');
  tv.muted = true;
  tv.playsInline = true;
  tv.preload = 'auto';
  tv.src = videoURL;

  const ok = await new Promise((resolve) => {
    tv.onloadedmetadata = () => resolve(true);
    tv.onerror = () => resolve(false);
  });
  if (!ok || token !== thumbToken) return;

  const capH = 136; // 표시 높이(68px)의 2배로 캡처해 레티나에서도 선명하게
  const aspect = (tv.videoWidth / tv.videoHeight) || (16 / 9);
  const capW = Math.max(2, Math.round(capH * aspect));
  const cnv = document.createElement('canvas');
  cnv.width = capW;
  cnv.height = capH;
  const ctx = cnv.getContext('2d');

  for (let i = 0; i < THUMB_COUNT; i++) {
    if (token !== thumbToken) return;
    await seekTo(tv, ((i + 0.5) / THUMB_COUNT) * edit.dur);
    if (token !== thumbToken) return;
    ctx.drawImage(tv, 0, 0, capW, capH);
    try {
      thumbBitmaps.push(await createImageBitmap(cnv));
    } catch {
      return; // 썸네일은 장식이므로 실패해도 편집 기능은 그대로 동작
    }
    drawThumbStrip(); // 뽑히는 대로 바로바로 표시
  }
  tv.removeAttribute('src');
  tv.load();
}

function drawThumbStrip() {
  const c = els.tlCanvas;
  const rect = els.timeline.getBoundingClientRect();
  if (!rect.width) return;
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.round(rect.width * dpr);
  c.height = Math.round(rect.height * dpr);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);

  const slotW = c.width / THUMB_COUNT;
  thumbBitmaps.forEach((bm, i) => {
    // 각 칸에 cover 방식으로 채운다
    const s = Math.max(slotW / bm.width, c.height / bm.height);
    const dw = bm.width * s;
    const dh = bm.height * s;
    ctx.save();
    ctx.beginPath();
    ctx.rect(i * slotW, 0, slotW + 1, c.height);
    ctx.clip();
    ctx.drawImage(bm, i * slotW + (slotW - dw) / 2, (c.height - dh) / 2, dw, dh);
    ctx.restore();
  });
}

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(drawThumbStrip, 150);
});

/* ---------------- 편집기: 선택 구간 UI ---------------- */

const pct = (t) => edit.dur ? (t / edit.dur) * 100 : 0;

function updateEditorUI() {
  const sPct = pct(edit.start);
  const ePct = pct(edit.end);
  els.tlSelection.style.left = sPct + '%';
  els.tlSelection.style.width = (ePct - sPct) + '%';
  els.tlDimL.style.width = sPct + '%';
  els.tlDimR.style.left = ePct + '%';
  els.tlDimR.style.width = (100 - ePct) + '%';

  els.selRangeLabel.textContent = `${formatTime(edit.start)} ~ ${formatTime(edit.end)}`;
  const dur = edit.end - edit.start;
  els.trimDuration.textContent = `${dur.toFixed(1)}초`;

  const warn = els.trimWarn;
  if (dur > 15) {
    warn.textContent = '구간이 길면 용량이 커지고 화질을 많이 포기하게 돼요. 3~6초를 권장해요.';
    warn.classList.remove('hidden');
  } else {
    warn.classList.add('hidden');
  }
}

/* ---------------- 편집기: 타임라인 드래그 ---------------- */

function timeAtX(clientX) {
  const r = els.timeline.getBoundingClientRect();
  return clamp(((clientX - r.left) / r.width) * edit.dur, 0, edit.dur);
}

let drag = null;

els.timeline.addEventListener('pointerdown', (e) => {
  if (busy || !edit.dur) return;
  e.preventDefault();
  let mode = 'scrub';
  if (e.target.closest('#tlHandleL')) mode = 'start';
  else if (e.target.closest('#tlHandleR')) mode = 'end';
  else if (e.target.closest('#tlSelection')) mode = 'move';

  const t = timeAtX(e.clientX);
  drag = {
    mode,
    wasPlaying: !els.video.paused,
    grabOffset: t - edit.start,
    len: edit.end - edit.start,
  };
  els.video.pause();
  try { els.timeline.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 캡처 불가 시에도 드래그는 계속 */ }
  applyDrag(t);
});

els.timeline.addEventListener('pointermove', (e) => {
  if (drag) applyDrag(timeAtX(e.clientX));
});

function endDrag() {
  if (!drag) return;
  if (drag.wasPlaying) els.video.play();
  drag = null;
}
els.timeline.addEventListener('pointerup', endDrag);
els.timeline.addEventListener('pointercancel', endDrag);

function applyDrag(t) {
  const v = els.video;
  if (drag.mode === 'scrub') {
    v.currentTime = Math.min(t, edit.dur - 0.001);
  } else if (drag.mode === 'start') {
    edit.start = clamp(t, 0, edit.end - MIN_GAP);
    v.currentTime = edit.start;
  } else if (drag.mode === 'end') {
    edit.end = clamp(t, edit.start + MIN_GAP, edit.dur);
    v.currentTime = Math.min(edit.end, edit.dur - 0.001);
  } else if (drag.mode === 'move') {
    const s = clamp(t - drag.grabOffset, 0, edit.dur - drag.len);
    edit.start = s;
    edit.end = s + drag.len;
    v.currentTime = edit.start;
  }
  updateEditorUI();
}

/* ---------------- 편집기: 재생 컨트롤 ---------------- */

function togglePlay() {
  if (busy || !edit.dur) return;
  const v = els.video;
  if (!v.paused) {
    v.pause();
    return;
  }
  // 구간 밖이면 시작점부터
  if (v.currentTime < edit.start - 0.01 || v.currentTime >= edit.end - 0.02) {
    v.currentTime = edit.start;
  }
  v.play();
}

function frameStep(dir, big) {
  if (busy || !edit.dur) return;
  const v = els.video;
  v.pause();
  const step = big ? 1 : (+els.optSpeed.value / +els.optFps.value); // GIF 한 프레임이 원본에서 차지하는 시간
  v.currentTime = clamp(v.currentTime + dir * step, 0, Math.max(0, edit.dur - 0.001));
}

function setStartHere() {
  if (busy || !edit.dur) return;
  edit.start = clamp(els.video.currentTime, 0, edit.end - MIN_GAP);
  updateEditorUI();
}

function setEndHere() {
  if (busy || !edit.dur) return;
  edit.end = clamp(els.video.currentTime, edit.start + MIN_GAP, edit.dur);
  updateEditorUI();
}

els.playBtn.addEventListener('click', togglePlay);
els.video.addEventListener('click', togglePlay);
els.frameBackBtn.addEventListener('click', () => frameStep(-1, false));
els.frameFwdBtn.addEventListener('click', () => frameStep(1, false));
els.jumpStartBtn.addEventListener('click', () => {
  if (busy || !edit.dur) return;
  els.video.currentTime = edit.start;
});
els.setStartBtn.addEventListener('click', setStartHere);
els.setEndBtn.addEventListener('click', setEndHere);
els.loopBtn.addEventListener('click', () => {
  edit.loop = !edit.loop;
  els.loopBtn.classList.toggle('active', edit.loop);
});

els.video.addEventListener('play', () => {
  els.playBtn.textContent = '❚❚';
  els.playBtn.setAttribute('aria-label', '일시정지');
});
els.video.addEventListener('pause', () => {
  els.playBtn.textContent = '▶';
  els.playBtn.setAttribute('aria-label', '재생');
});

// 재생 속도 설정은 미리보기에도 즉시 반영
els.optSpeed.addEventListener('change', () => {
  els.video.playbackRate = +els.optSpeed.value;
});

// 매 프레임 재생 헤드·시간 표시를 갱신하고 구간 끝에서 반복/정지 처리
function tick() {
  const v = els.video;
  if (edit.dur && !els.panelTrim.classList.contains('hidden')) {
    if (!v.paused && !busy && v.currentTime >= edit.end) {
      if (edit.loop) v.currentTime = edit.start;
      else v.pause();
    }
    els.tlPlayhead.style.left = pct(clamp(v.currentTime, 0, edit.dur)) + '%';
    els.curTime.textContent = formatTime(v.currentTime);
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

/* ---------------- 편집기: 키보드 단축키 ---------------- */

document.addEventListener('keydown', (e) => {
  if (els.panelTrim.classList.contains('hidden') || busy || !edit.dur) return;
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;

  if (e.key === ' ') {
    e.preventDefault();
    togglePlay();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    frameStep(-1, e.shiftKey);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    frameStep(1, e.shiftKey);
  } else if (e.key === '[') {
    e.preventDefault();
    setStartHere();
  } else if (e.key === ']') {
    e.preventDefault();
    setEndHere();
  } else if (e.key === 'Home') {
    e.preventDefault();
    els.video.currentTime = edit.start;
  }
});

/* ---------------- GIF 생성 ---------------- */

els.makeBtn.addEventListener('click', makeGif);
els.retryBtn.addEventListener('click', () => {
  els.panelResult.classList.add('hidden');
  els.panelSettings.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

async function makeGif() {
  const video = els.video;
  const start = edit.start;
  const end = edit.end;
  const speed = +els.optSpeed.value;
  const userFps = +els.optFps.value;
  const userColors = +els.optColors.value;
  const autoCompress = els.optAutoCompress.checked;

  const requestedWidth = Math.min(+els.optWidth.value, NAVER_MAX_WIDTH, video.videoWidth);

  els.makeBtn.disabled = true;
  busy = true;
  els.panelResult.classList.add('hidden');
  progress.show('영상에서 프레임을 추출하는 중…', 0);

  try {
    video.pause();

    // 출력 GIF 기준 프레임 수. 상한을 넘으면 FPS를 낮추되 선택 구간 전체를 항상 담는다.
    const clipDur = (end - start) / speed;
    let fps = userFps;
    let fpsAdjusted = false;
    if (clipDur * fps > MAX_FRAMES) {
      fps = MAX_FRAMES / clipDur; // 소수 fps 허용 — 프레임 간격을 늘려 구간을 자르지 않는다
      fpsAdjusted = true;
    }

    const frames = await captureFrames(video, start, end, fps, speed, requestedWidth, (done, total) => {
      progress.show(`영상에서 프레임을 추출하는 중… (${done}/${total})`, (done / total) * 50);
    });

    if (!frames.length) throw new Error('프레임을 추출하지 못했어요.');

    const baseW = frames[0].width;
    const baseH = frames[0].height;
    const baseDelay = Math.round(1000 / fps);

    // 압축 시도 설정: scale(크기 비율), colors(색상 수), frameSkip(프레임 건너뛰기)
    let settings = { scale: 1, colors: userColors, frameSkip: 1 };
    let attempt = 0;
    let result = null;

    while (true) {
      attempt++;
      const label = attempt === 1
        ? 'GIF로 인코딩하는 중…'
        : `10MB에 맞게 다시 압축하는 중… (${attempt}번째 시도)`;

      result = await encodeAttempt(frames, baseW, baseH, baseDelay, settings, (p) => {
        progress.show(label, 50 + p * 50);
      });

      if (!autoCompress || result.size <= SIZE_TARGET || attempt >= MAX_ATTEMPTS) break;

      const next = nextSettings(settings, result.size, SIZE_TARGET);
      // 더 줄일 수 있는 설정이 없으면 같은 결과를 반복 인코딩하지 않고 종료
      if (next.scale === settings.scale && next.colors === settings.colors && next.frameSkip === settings.frameSkip) break;
      settings = next;
    }

    showResult(result, fpsAdjusted ? fps : null);
  } catch (err) {
    console.error(err);
    alert('GIF를 만드는 중 문제가 생겼어요: ' + (err && err.message ? err.message : err));
  } finally {
    els.makeBtn.disabled = false;
    busy = false;
    progress.hide();
    video.currentTime = edit.start; // 추출하며 움직인 재생 헤드를 구간 시작으로 되돌린다
  }
}

// 영상에서 지정 구간의 프레임을 ImageData 배열로 추출
async function captureFrames(video, start, end, fps, speed, outWidth, onProgress) {
  const scale = outWidth / video.videoWidth;
  const w = evenize(Math.round(video.videoWidth * scale));
  const h = evenize(Math.round(video.videoHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const srcStep = speed / fps; // GIF 한 프레임이 원본 영상에서 차지하는 시간
  const times = [];
  for (let t = start; t < end - 1e-6 && times.length < MAX_FRAMES; t += srcStep) times.push(t);
  if (!times.length) times.push(start);

  const frames = [];
  for (let i = 0; i < times.length; i++) {
    await seekTo(video, times[i]);
    ctx.drawImage(video, 0, 0, w, h);
    frames.push(ctx.getImageData(0, 0, w, h));
    onProgress(i + 1, times.length);
  }
  return frames;
}

function seekTo(video, t) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('seeked', finish);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, 5000); // seeked가 안 오는 브라우저 대비 (고해상도 디코딩 여유 포함)
    video.addEventListener('seeked', finish);
    video.currentTime = Math.min(t, Math.max(0, video.duration - 0.001));
  });
}

// 저장해 둔 원본 프레임을 설정에 맞게 축소/샘플링해서 워커로 인코딩
async function encodeAttempt(frames, baseW, baseH, baseDelay, settings, onProgress) {
  const w = Math.max(2, evenize(Math.round(baseW * settings.scale)));
  const h = Math.max(2, evenize(Math.round(baseH * settings.scale)));
  const delay = baseDelay * settings.frameSkip;

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = baseW;
  srcCanvas.height = baseH;
  const srcCtx = srcCanvas.getContext('2d');

  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = w;
  dstCanvas.height = h;
  const dstCtx = dstCanvas.getContext('2d', { willReadFrequently: true });
  dstCtx.imageSmoothingQuality = 'high';

  const buffers = [];
  for (let i = 0; i < frames.length; i += settings.frameSkip) {
    if (settings.scale === 1) {
      buffers.push(frames[i].data.slice().buffer); // 원본 보존을 위해 복사
    } else {
      srcCtx.putImageData(frames[i], 0, 0);
      dstCtx.drawImage(srcCanvas, 0, 0, w, h);
      buffers.push(dstCtx.getImageData(0, 0, w, h).data.buffer);
    }
  }

  const buffer = await encodeInWorker(buffers, w, h, delay, settings.colors, onProgress);
  return {
    blob: new Blob([buffer], { type: 'image/gif' }),
    size: buffer.byteLength,
    width: w,
    height: h,
    frameCount: buffers.length,
    delay,
  };
}

function encodeInWorker(buffers, width, height, delay, maxColors, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./gif-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        onProgress(msg.done / msg.total);
      } else if (msg.type === 'done') {
        worker.terminate();
        resolve(msg.buffer);
      } else if (msg.type === 'error') {
        worker.terminate();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || '인코딩 워커 오류'));
    };
    worker.postMessage({ frames: buffers, width, height, delay, maxColors }, buffers);
  });
}

// 용량 초과 시 다음 시도의 설정을 정한다: 색상 수 → 크기 → 프레임 순으로 줄인다.
function nextSettings(cur, size, target) {
  const next = { ...cur };
  const over = size / target;

  if (next.colors > 128) {
    next.colors = 128;
    if (over < 1.35) return next; // 색상만 줄여도 될 것 같으면 크기는 유지
  } else if (next.colors > 64) {
    next.colors = 64;
    if (over < 1.25) return next;
  }

  // GIF 용량은 대략 픽셀 수에 비례 — 직전 인코딩의 실측 크기로 목표 크기를 예측해 한 번에 줄인다.
  next.scale = Math.max(0.3, next.scale * Math.sqrt(target / size) * 0.95);

  // 그래도 많이 초과하면 프레임을 절반으로 (재생 속도는 delay를 늘려 유지)
  if (over > 2.4 && next.frameSkip === 1) next.frameSkip = 2;

  return next;
}

/* ---------------- 결과 표시 ---------------- */

function showResult(result, adjustedFps) {
  if (resultURL) URL.revokeObjectURL(resultURL);
  resultURL = URL.createObjectURL(result.blob);

  const sizeStr = formatSize(result.size);
  const usedPct = Math.round((result.size / NAVER_LIMIT) * 100);

  els.resultImg.src = resultURL;
  els.statSize.textContent = sizeStr;
  els.statSize.className = 'stat-value ' + (result.size <= NAVER_LIMIT ? 'size-ok' : 'size-over');
  els.statDim.textContent = `${result.width}×${result.height}`;
  els.statLen.textContent = formatTime((result.frameCount * result.delay) / 1000);
  els.statFrames.textContent = `${result.frameCount}장 · ${Math.round(1000 / result.delay)}fps`;

  els.sizeGaugeFill.style.width = '0%';
  requestAnimationFrame(() => { els.sizeGaugeFill.style.width = Math.min(100, usedPct) + '%'; });
  els.sizeGaugeFill.classList.toggle('over', result.size > NAVER_LIMIT);
  els.sizeGaugeUsed.textContent = `${sizeStr} 사용 (${usedPct}%)`;

  // 구간이 길어 FPS를 자동으로 낮췄다면 사용자에게 알린다
  const fpsNote = adjustedFps
    ? ` · 구간이 길어 초당 프레임을 ${Math.round(1000 / result.delay)}fps로 낮춰 전체 구간을 담았어요.`
    : '';

  const verdict = els.resultVerdict;
  if (result.size <= NAVER_LIMIT) {
    verdict.className = 'result-verdict ok';
    verdict.textContent = `✅ 네이버 블로그에 올릴 수 있어요! (10MB 제한 중 ${sizeStr} 사용)${fpsNote}`;
  } else {
    verdict.className = 'result-verdict over';
    verdict.textContent = `⚠ 10MB를 초과했어요 (${sizeStr}). 구간을 더 짧게 하거나 가로 크기·FPS를 낮춰 보세요.${fpsNote}`;
  }

  const base = currentFile ? currentFile.name.replace(/\.[^.]+$/, '') : 'naver-blog';
  els.downloadBtn.href = resultURL;
  els.downloadBtn.download = `${base}_움짤.gif`;

  els.panelResult.classList.remove('hidden');
  els.panelResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------------- 유틸 ---------------- */

function evenize(n) {
  return n % 2 === 0 ? n : n - 1;
}
