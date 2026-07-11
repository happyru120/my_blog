// 영상 → GIF 변환기 (네이버 블로그 기준 자동 압축)
// 모든 처리는 브라우저 안에서만 이루어진다.

const NAVER_LIMIT = 10 * 1024 * 1024;      // 네이버 블로그 GIF 용량 제한 10MB
const NAVER_MAX_WIDTH = 966;               // 본문 최대 폭 — 초과 시 네이버가 재변환하며 움직임이 사라질 수 있음
const SIZE_TARGET = NAVER_LIMIT * 0.97;    // 안전 여유분을 둔 압축 목표
const MAX_FRAMES = 240;                    // 메모리 보호용 프레임 상한
const MAX_ATTEMPTS = 6;                    // 자동 압축 재시도 횟수

const $ = (id) => document.getElementById(id);

const els = {
  dropZone: $('dropZone'),
  fileInput: $('fileInput'),
  video: $('video'),
  fileMeta: $('fileMeta'),
  panelTrim: $('panel-trim'),
  panelSettings: $('panel-settings'),
  panelResult: $('panel-result'),
  trimStart: $('trimStart'),
  trimEnd: $('trimEnd'),
  trimStartLabel: $('trimStartLabel'),
  trimEndLabel: $('trimEndLabel'),
  trimDuration: $('trimDuration'),
  trimWarn: $('trimWarn'),
  previewRangeBtn: $('previewRangeBtn'),
  optWidth: $('optWidth'),
  optFps: $('optFps'),
  optColors: $('optColors'),
  optSpeed: $('optSpeed'),
  optAutoCompress: $('optAutoCompress'),
  makeBtn: $('makeBtn'),
  progressWrap: $('progressWrap'),
  progressLabel: $('progressLabel'),
  progressPct: $('progressPct'),
  progressBarFill: $('progressBarFill'),
  resultImg: $('resultImg'),
  resultVerdict: $('resultVerdict'),
  statSize: $('statSize'),
  statDim: $('statDim'),
  statLen: $('statLen'),
  statFrames: $('statFrames'),
  downloadBtn: $('downloadBtn'),
  retryBtn: $('retryBtn'),
};

let currentFile = null;
let videoURL = null;
let resultURL = null;

/* ---------------- 파일 선택 ---------------- */

els.dropZone.addEventListener('click', () => els.fileInput.click());
els.fileInput.addEventListener('change', () => {
  if (els.fileInput.files.length) loadVideo(els.fileInput.files[0]);
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
els.dropZone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) loadVideo(file);
});

function loadVideo(file) {
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
    const dur = video.duration;
    els.trimStart.max = els.trimEnd.max = dur.toFixed(1);
    els.trimStart.value = 0;
    els.trimEnd.value = Math.min(dur, 6).toFixed(1); // 움짤은 짧게가 기본
    updateTrimUI();

    els.fileMeta.textContent =
      `${file.name} · ${video.videoWidth}×${video.videoHeight} · ${formatTime(dur)} · ${formatSize(file.size)}`;

    els.panelTrim.classList.remove('hidden');
    els.panelSettings.classList.remove('hidden');
    els.panelResult.classList.add('hidden');
    els.panelTrim.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  video.onerror = () => {
    alert('영상을 불러오지 못했어요. MP4(H.264) 파일을 권장합니다.');
  };
}

/* ---------------- 구간 자르기 ---------------- */

els.trimStart.addEventListener('input', () => {
  if (+els.trimStart.value >= +els.trimEnd.value) {
    els.trimStart.value = Math.max(0, +els.trimEnd.value - 0.1).toFixed(1);
  }
  els.video.currentTime = +els.trimStart.value;
  updateTrimUI();
});

els.trimEnd.addEventListener('input', () => {
  if (+els.trimEnd.value <= +els.trimStart.value) {
    els.trimEnd.value = (+els.trimStart.value + 0.1).toFixed(1);
  }
  els.video.currentTime = +els.trimEnd.value;
  updateTrimUI();
});

function updateTrimUI() {
  const start = +els.trimStart.value;
  const end = +els.trimEnd.value;
  const dur = end - start;
  els.trimStartLabel.textContent = formatTime(start);
  els.trimEndLabel.textContent = formatTime(end);
  els.trimDuration.textContent = `${dur.toFixed(1)}초`;

  const warn = els.trimWarn;
  if (dur > 15) {
    warn.textContent = '구간이 길면 용량이 커지고 화질을 많이 포기하게 돼요. 3~6초를 권장해요.';
    warn.classList.remove('hidden');
  } else {
    warn.classList.add('hidden');
  }
}

els.previewRangeBtn.addEventListener('click', () => {
  const video = els.video;
  const start = +els.trimStart.value;
  const end = +els.trimEnd.value;
  video.currentTime = start;
  video.play();
  const onTime = () => {
    if (video.currentTime >= end) {
      video.pause();
      video.removeEventListener('timeupdate', onTime);
    }
  };
  video.addEventListener('timeupdate', onTime);
});

/* ---------------- GIF 생성 ---------------- */

els.makeBtn.addEventListener('click', makeGif);
els.retryBtn.addEventListener('click', () => {
  els.panelResult.classList.add('hidden');
  els.panelSettings.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

async function makeGif() {
  const video = els.video;
  const start = +els.trimStart.value;
  const end = +els.trimEnd.value;
  const speed = +els.optSpeed.value;
  const userFps = +els.optFps.value;
  const userColors = +els.optColors.value;
  const autoCompress = els.optAutoCompress.checked;

  const requestedWidth = Math.min(+els.optWidth.value, NAVER_MAX_WIDTH, video.videoWidth);

  els.makeBtn.disabled = true;
  els.panelResult.classList.add('hidden');
  showProgress('영상에서 프레임을 추출하는 중…', 0);

  try {
    video.pause();

    // 출력 GIF 기준 프레임 수. 상한을 넘으면 FPS를 자동으로 낮춰서 맞춘다.
    const clipDur = (end - start) / speed;
    let fps = userFps;
    if (Math.ceil(clipDur * fps) > MAX_FRAMES) {
      fps = Math.max(4, Math.floor(MAX_FRAMES / clipDur));
    }

    const frames = await captureFrames(video, start, end, fps, speed, requestedWidth, (done, total) => {
      showProgress(`영상에서 프레임을 추출하는 중… (${done}/${total})`, (done / total) * 50);
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
        showProgress(label, 50 + p * 50);
      });

      if (!autoCompress || result.size <= SIZE_TARGET || attempt >= MAX_ATTEMPTS) break;

      settings = nextSettings(settings, result.size, SIZE_TARGET);
    }

    showResult(result, fps);
  } catch (err) {
    console.error(err);
    alert('GIF를 만드는 중 문제가 생겼어요: ' + (err && err.message ? err.message : err));
  } finally {
    els.makeBtn.disabled = false;
    hideProgress();
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
    const timer = setTimeout(finish, 2000); // seeked가 안 오는 브라우저 대비
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

  // GIF 용량은 대략 픽셀 수에 비례하므로 넓이 비율의 제곱근만큼 줄인다.
  next.scale = Math.max(0.3, next.scale * Math.min(0.92, Math.sqrt(target / size)));

  // 그래도 많이 초과하면 프레임을 절반으로 (재생 속도는 delay를 늘려 유지)
  if (over > 2.4 && next.frameSkip === 1) next.frameSkip = 2;

  return next;
}

/* ---------------- 결과 표시 ---------------- */

function showResult(result, fps) {
  if (resultURL) URL.revokeObjectURL(resultURL);
  resultURL = URL.createObjectURL(result.blob);

  els.resultImg.src = resultURL;
  els.statSize.textContent = formatSize(result.size);
  els.statSize.className = 'stat-value ' + (result.size <= NAVER_LIMIT ? 'size-ok' : 'size-over');
  els.statDim.textContent = `${result.width}×${result.height}`;
  els.statLen.textContent = formatTime((result.frameCount * result.delay) / 1000);
  els.statFrames.textContent = `${result.frameCount}장 · ${Math.round(1000 / result.delay)}fps`;

  const verdict = els.resultVerdict;
  if (result.size <= NAVER_LIMIT) {
    verdict.className = 'result-verdict ok';
    verdict.textContent = `✅ 네이버 블로그에 올릴 수 있어요! (10MB 제한 중 ${formatSize(result.size)} 사용)`;
  } else {
    verdict.className = 'result-verdict over';
    verdict.textContent = `⚠ 10MB를 초과했어요 (${formatSize(result.size)}). 구간을 더 짧게 하거나 가로 크기·FPS를 낮춰 보세요.`;
  }

  const base = currentFile ? currentFile.name.replace(/\.[^.]+$/, '') : 'naver-blog';
  els.downloadBtn.href = resultURL;
  els.downloadBtn.download = `${base}_움짤.gif`;

  els.panelResult.classList.remove('hidden');
  els.panelResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

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

function evenize(n) {
  return n % 2 === 0 ? n : n - 1;
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + 'MB';
  if (bytes >= 1024) return Math.round(bytes / 1024) + 'KB';
  return bytes + 'B';
}

function formatTime(sec) {
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return `${m}분 ${s.toFixed(1)}초`;
  }
  return `${sec.toFixed(1)}초`;
}
