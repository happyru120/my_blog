// 금칙어 검사 — 의료법/표시광고법 위반 소지 표현을 사전 기반으로 하이라이트
// ※ 네이버 공식 기준이 아닌 참고용 사전이다.

import { $ } from './utils.js';

const els = {
  input: $('textInput'),
  checkBtn: $('checkBtn'),
  panelResult: $('panel-result'),
  resultVerdict: $('resultVerdict'),
  checkCats: $('checkCats'),
  checkPreview: $('checkPreview'),
};

// 카테고리별 위험 표현 사전
const DICTIONARY = [
  {
    key: 'medical',
    name: '효능 단정 (의료법·식품표시광고법 위험)',
    icon: '💊',
    advice: '"~에 도움이 될 수 있어요" 처럼 단정하지 않는 표현으로 바꿔보세요.',
    words: [
      '완치', '치료 효과', '치료효과', '치료됩니다', '치료된다', '부작용 없음', '부작용이 없',
      '만병통치', '특효', '즉효', '항암', '디톡스', '독소 배출', '노폐물 배출',
      '살균', '멸균', '항균 효과', '면역력 강화', '면역력 증진', '피부 재생',
      '주름 제거', '기미 제거', '흉터 제거', '탈모 방지', '발모', '혈액순환 개선',
      '다이어트 효과', '지방 분해', '체지방 감소', '숙취 해소', '통증 완화', '염증 완화',
    ],
  },
  {
    key: 'exaggeration',
    name: '최상급·단정 표현 (표시광고법 실증 필요)',
    icon: '📢',
    advice: '객관적 근거를 제시할 수 없다면 "제 기준 최고" 같은 주관 표현으로 바꾸세요.',
    words: [
      '최고', '최상', '최저가', '최초', '최대', '유일한', '유일무이', '독보적',
      '1위', '일위', '완벽', '완벽한', '무조건', '절대', '100%', '백프로', '백퍼',
      '보장합니다', '보장된', '전혀 없', '검증된', '공식 인증',
    ],
  },
  {
    key: 'gambling',
    name: '사행성·금융 위험 단어',
    icon: '🎰',
    advice: '이 단어들이 반복되면 스팸성 글로 분류될 수 있어요. 꼭 필요한 경우가 아니면 빼세요.',
    words: [
      '도박', '카지노', '토토', '바카라', '베팅', '슬롯', '경마', '복권 당첨',
      '무담보 대출', '급전', '즉시 대출', '당일 대출', '소액결제 현금화', '휴대폰 현금화',
    ],
  },
  {
    key: 'disclosure',
    name: '협찬 표기 점검',
    icon: '🤝',
    advice: '대가를 받았다면 글 앞부분에 "협찬받아 작성" 표기가 의무예요. 이 단어가 없다는 것 자체는 문제가 아니에요.',
    words: ['협찬', '원고료', '제공받아', '광고입니다', '유료 광고'],
    informational: true, // 발견되면 좋은 신호로 취급
  },
];

els.checkBtn.addEventListener('click', check);

function check() {
  const text = els.input.value;
  if (!text.trim()) {
    alert('검사할 글을 먼저 붙여넣어 주세요.');
    return;
  }

  // 카테고리별 매치 수집: [{word, count}]
  const catResults = DICTIONARY.map((cat) => {
    const found = [];
    for (const word of cat.words) {
      const count = countOccurrences(text, word);
      if (count > 0) found.push({ word, count });
    }
    return { ...cat, found };
  });

  const riskCats = catResults.filter((c) => !c.informational);
  const totalRisk = riskCats.reduce((s, c) => s + c.found.reduce((x, f) => x + f.count, 0), 0);
  const disclosure = catResults.find((c) => c.informational);
  const hasDisclosure = disclosure.found.length > 0;

  // 종합 판정
  const verdict = els.resultVerdict;
  if (totalRisk === 0) {
    verdict.className = 'result-verdict ok';
    verdict.textContent = '✅ 위험 표현이 발견되지 않았어요. (참고용 검사이며 안전을 보장하지는 않아요)';
  } else {
    verdict.className = 'result-verdict over';
    verdict.textContent = `⚠ 위험 표현 ${totalRisk}곳 발견 — 아래에서 확인하고 순화해 보세요.`;
  }

  // 카테고리 카드
  els.checkCats.innerHTML = '';
  for (const cat of catResults) {
    if (cat.informational) continue;
    if (!cat.found.length) continue;
    const div = document.createElement('div');
    div.className = 'check-cat';
    div.innerHTML = `
      <div class="check-cat-title">${cat.icon} ${escapeHtml(cat.name)}</div>
      <div class="check-cat-words"></div>
      <div class="check-cat-advice">💬 ${escapeHtml(cat.advice)}</div>`;
    const wordsBox = div.querySelector('.check-cat-words');
    for (const f of cat.found) {
      const chip = document.createElement('span');
      chip.className = 'badge badge-warn';
      chip.textContent = f.count > 1 ? `${f.word} ×${f.count}` : f.word;
      wordsBox.appendChild(chip);
    }
    els.checkCats.appendChild(div);
  }

  // 협찬 표기 안내
  const discDiv = document.createElement('div');
  discDiv.className = 'check-cat';
  discDiv.innerHTML = hasDisclosure
    ? `<div class="check-cat-title">🤝 협찬 표기</div><div class="check-cat-advice">✅ 협찬/광고 관련 표기가 글에 있어요. (${disclosure.found.map((f) => escapeHtml(f.word)).join(', ')})</div>`
    : `<div class="check-cat-title">🤝 협찬 표기</div><div class="check-cat-advice">이 글이 협찬·대가성 글이라면 "협찬받아 작성했습니다" 같은 표기를 잊지 마세요. 아니라면 무시해도 돼요.</div>`;
  els.checkCats.appendChild(discDiv);

  // 하이라이트 미리보기
  els.checkPreview.innerHTML = '';
  if (totalRisk > 0) {
    const riskWords = riskCats.flatMap((c) => c.found.map((f) => f.word))
      .sort((a, b) => b.length - a.length); // 긴 단어 우선 매치
    els.checkPreview.appendChild(buildHighlighted(text, riskWords));
  }

  els.panelResult.classList.remove('hidden');
  els.panelResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function countOccurrences(text, word) {
  let count = 0;
  let idx = 0;
  while ((idx = text.indexOf(word, idx)) !== -1) {
    count++;
    idx += word.length;
  }
  return count;
}

// 위험 단어를 <mark>로 감싼 미리보기 DOM 생성 (innerHTML 조립 없이 안전하게)
function buildHighlighted(text, words) {
  const container = document.createElement('div');
  container.className = 'check-preview-text';

  const pattern = new RegExp(words.map(escapeRegex).join('|'), 'g');
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) container.appendChild(document.createTextNode(text.slice(last, m.index)));
    const mark = document.createElement('mark');
    mark.textContent = m[0];
    container.appendChild(mark);
    last = m.index + m[0].length;
  }
  if (last < text.length) container.appendChild(document.createTextNode(text.slice(last)));
  return container;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
