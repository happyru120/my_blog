// 여러 도구 페이지가 공유하는 유틸리티

export const $ = (id) => document.getElementById(id);

export function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + 'MB';
  if (bytes >= 1024) return Math.round(bytes / 1024) + 'KB';
  return bytes + 'B';
}

export function formatTime(sec) {
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return `${m}분 ${s.toFixed(1)}초`;
  }
  return `${sec.toFixed(1)}초`;
}

// 드롭존 공통 배선: 클릭으로 파일 선택, 드래그&드롭, .dragover 표시
export function initDropZone(zone, input, onFiles) {
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    if (input.files.length) onFiles([...input.files]);
    input.value = ''; // 같은 파일 재선택 허용
  });
  ['dragover', 'dragenter'].forEach((ev) =>
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
    })
  );
  zone.addEventListener('drop', (e) => {
    const files = [...e.dataTransfer.files];
    if (files.length) onFiles(files);
  });
}

// 진행률 표시 공통 컨트롤 (#progressWrap/#progressLabel/#progressPct/#progressBarFill 구조 기준)
export function createProgress() {
  const wrap = $('progressWrap');
  const label = $('progressLabel');
  const pctEl = $('progressPct');
  const fill = $('progressBarFill');
  return {
    show(text, pct) {
      wrap.classList.remove('hidden');
      label.textContent = text;
      const v = Math.min(100, Math.round(pct));
      pctEl.textContent = `${v}%`;
      fill.style.width = `${v}%`;
    },
    hide() {
      wrap.classList.add('hidden');
      fill.style.width = '0%';
    },
  };
}
