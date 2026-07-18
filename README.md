# 블로그 도구함★

네이버 블로그 운영에 필요한 도구들을 모아 둔 정적 웹사이트입니다.
서버 없이 동작하며(모든 처리는 방문자의 브라우저 안에서만 이루어짐) GitHub Pages 등 정적 호스팅에 바로 배포할 수 있습니다.

**바로 쓰기 → https://happyru120.github.io/my_blog/**

> NO SERVER · NO SIGNUP · NO 눈물 — 파일은 단 한 장도 서버로 전송되지 않습니다.

## 도구 목록

| # | 도구 | 설명 |
| --- | --- | --- |
| TOOL 01 | 🎬 [영상 → GIF 변환기](gif-maker.html) | 영상 구간을 잘라 GIF로 만들고 네이버 기준(10MB · 966px)에 맞게 자동 압축 |
| TOOL 02 | 🖼️ [이미지 리사이즈](image-resizer.html) | 본문 폭(966px) 일괄 리사이즈 + GPS 위치정보 제거 + 워터마크 |
| TOOL 03 | ✂️ [썸네일 메이커](thumbnail-maker.html) | 1:1(800×800) 대표 이미지 제작 — 사진 배치·확대, 제목 텍스트, 어둡게 필터 |
| TOOL 04 | 🔤 [글자 수 세기](char-counter.html) | 공백 포함/제외·단어·원고지·읽는 시간, 목표 달성률, 자동 저장 |
| TOOL 05 | 🚨 [금칙어 검사](word-checker.html) | 의료법·표시광고법 위험 표현 하이라이트 + 협찬 표기 점검 |

## 주요 기능

### 🎬 영상 → GIF 변환기

- **편집기식 구간 선택**: 필름 스트립 타임라인, 프레임 단위 이동, 구간 반복 재생, 키보드 단축키(`Space` `←→` `[` `]`)
- **네이버 기준 자동 압축**: 결과물이 10MB를 넘으면 색상 수 → 크기 → 프레임 순으로 자동 조절
- **설정**: 가로 크기(최대 966px), FPS, 색상 수, 재생 속도

### 🖼️ 이미지 리사이즈

- **일괄 처리**: 사진 여러 장을 한 번에 966px(본문 최대 폭)로 리사이즈·압축, 전체 ZIP 저장
- **GPS 위치정보(EXIF) 제거**: 변환 시 항상 제거. 변환 전 목록에서 위치정보가 든 사진을 배지로 표시
- **워터마크**: 닉네임 텍스트 또는 PNG 로고를 원하는 위치에 삽입, 실시간 미리보기

### ✂️ 썸네일 메이커 · 🔤 글자 수 세기 · 🚨 금칙어 검사

- 썸네일: 800×800 캔버스에 사진 드래그 배치 + 제목 얹어 JPG 저장
- 글자 수: 쓰는 대로 실시간 집계, 쓰던 글은 브라우저(localStorage)에만 자동 저장
- 금칙어: 효능 단정·최상급 표현·협찬 표기를 분류별로 검출하고 본문에 하이라이트

## 디자인

[claude.ai/design](https://claude.ai/design) 시안 기반의 **네오-진(zine) 스타일** — 굵은 블랙 타이포, 3px 보더 그리드, 흑백 브루탈리즘.

- 배경 `#f7f7f4` / 잉크 `#111`, 3px 블랙 보더 프레임과 풀블리드 섹션
- 헤드라인: [Black Han Sans](https://fonts.google.com/specimen/Black+Han+Sans) · 본문: [Pretendard](https://github.com/orioncactus/pretendard)
- 디자인 토큰과 컴포넌트는 `assets/css/style.css` 한 파일에 정리 (`:root` 변수 참고)

## 실행 방법

정적 파일이므로 아무 웹 서버로나 열면 됩니다. (ES 모듈/워커를 쓰기 때문에 `file://`로 직접 열면 동작하지 않습니다.)

```bash
# 예: 파이썬 내장 서버
python3 -m http.server 8000
# → http://localhost:8000
```

GitHub Pages 배포: 저장소 Settings → Pages → Branch를 배포할 브랜치로 지정하면 끝.

## 기술 구조

- 순수 HTML/CSS/JS — 빌드 도구·프레임워크 없음 (폰트만 CDN에서 로드, 실패 시 시스템 폰트 폴백)
- GIF 인코딩: [gifenc](https://github.com/mattdesl/gifenc) (MIT, `assets/js/gifenc.esm.js`로 포함)
- 프레임 추출: `<video>` + `<canvas>` seek 캡처, 인코딩은 Web Worker에서 실행
- ZIP 저장: 외부 라이브러리 없는 store 방식 생성기 (`assets/js/mini-zip.js`)
- 공용 유틸(`assets/js/utils.js`): 드롭존 배선, 진행률 표시, 크기/시간 포맷
