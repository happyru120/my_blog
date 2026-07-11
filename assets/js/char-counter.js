// 글자 수 세기 — 실시간 통계 + 목표 달성률 + 브라우저 자동 저장

import { $ } from './utils.js';

const els = {
  input: $('textInput'),
  cntWith: $('cntWith'),
  cntWithout: $('cntWithout'),
  cntWords: $('cntWords'),
  cntSentences: $('cntSentences'),
  cntPages: $('cntPages'),
  cntReadTime: $('cntReadTime'),
  goalSelect: $('goalSelect'),
  goalGauge: $('goalGauge'),
  goalFill: $('goalFill'),
  goalUsed: $('goalUsed'),
  goalLabel: $('goalLabel'),
  copyBtn: $('copyBtn'),
  clearBtn: $('clearBtn'),
};

const STORAGE_KEY = 'blog-tools:char-counter:draft';
const GOAL_KEY = 'blog-tools:char-counter:goal';

/* ---------------- 초기화 (자동 저장 복원) ---------------- */

try {
  const draft = localStorage.getItem(STORAGE_KEY);
  if (draft) els.input.value = draft;
  const goal = localStorage.getItem(GOAL_KEY);
  if (goal !== null) els.goalSelect.value = goal;
} catch { /* 시크릿 모드 등에서 localStorage 불가 시 무시 */ }

/* ---------------- 카운트 ---------------- */

let saveTimer = null;

els.input.addEventListener('input', () => {
  update();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, els.input.value); } catch { /* 무시 */ }
  }, 400);
});

els.goalSelect.addEventListener('change', () => {
  try { localStorage.setItem(GOAL_KEY, els.goalSelect.value); } catch { /* 무시 */ }
  update();
});

function update() {
  const text = els.input.value;
  const withSpaces = [...text].length; // 서로게이트 쌍(이모지)을 1자로 계산
  const withoutSpaces = [...text.replace(/\s/g, '')].length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const sentences = (text.match(/[.!?…。]+(?=\s|$)|\n{2,}/g) || []).length;
  const pages = Math.ceil(withSpaces / 200);
  const readMin = withSpaces / 500;

  els.cntWith.textContent = withSpaces.toLocaleString();
  els.cntWithout.textContent = withoutSpaces.toLocaleString();
  els.cntWords.textContent = words.toLocaleString();
  els.cntSentences.textContent = sentences.toLocaleString();
  els.cntPages.textContent = `${pages}매`;
  els.cntReadTime.textContent = readMin < 1
    ? (withSpaces ? '1분 미만' : '0분')
    : `약 ${Math.round(readMin)}분`;

  const goal = +els.goalSelect.value;
  if (!goal) {
    els.goalGauge.classList.add('hidden');
    return;
  }
  els.goalGauge.classList.remove('hidden');
  const pct = Math.min(100, (withSpaces / goal) * 100);
  els.goalFill.style.width = pct + '%';
  els.goalFill.classList.toggle('over', false);
  els.goalUsed.textContent = `${withSpaces.toLocaleString()}자 (${Math.round((withSpaces / goal) * 100)}%)`;
  els.goalLabel.textContent = withSpaces >= goal
    ? '🎉 목표 달성!'
    : `목표 ${goal.toLocaleString()}자`;
}

/* ---------------- 버튼 ---------------- */

els.copyBtn.addEventListener('click', async () => {
  if (!els.input.value) return;
  try {
    await navigator.clipboard.writeText(els.input.value);
    const orig = els.copyBtn.textContent;
    els.copyBtn.textContent = '✅ 복사됨!';
    setTimeout(() => { els.copyBtn.textContent = orig; }, 1500);
  } catch {
    els.input.select();
    document.execCommand('copy');
  }
});

els.clearBtn.addEventListener('click', () => {
  if (els.input.value && !confirm('작성 중인 글을 모두 지울까요?')) return;
  els.input.value = '';
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* 무시 */ }
  update();
  els.input.focus();
});

update();
