# Handoff: 주식 포트폴리오 공유 앱 (Stock Portfolio & Community App)

## Overview
국내·미국 주식 자산을 관리하고, 친구들과 포트폴리오(보유 종목·수량·비중·수익률)를 공유하는 모바일 앱입니다. 사용자는 자신의 총 자산과 종목별 수익을 확인하고, 금액을 가린 채 비중만 공유하는 모드로 친구 피드·랭킹에 참여합니다. 타깃 플랫폼은 **모바일(휴대폰)**, 구현 프레임워크는 **Flutter**를 가정합니다.

## About the Design Files
이 번들의 `주식 포트폴리오 공유 앱.dc.html` 파일은 **HTML로 만든 디자인 레퍼런스**입니다 — 최종적인 모양과 동작을 보여주는 프로토타입이며, 그대로 복사해 출시하는 프로덕션 코드가 아닙니다. 작업의 목표는 이 디자인을 **Flutter 환경에서 다시 구현**하는 것입니다. Flutter의 표준 위젯과 패턴(Material/Cupertino, `fl_chart` 등)을 사용해 아래 명세대로 화면을 재현하세요.

> 파일은 Design Component(`.dc.html`) 형식이라 브라우저로 바로 열립니다. 로직(데이터·상태·렌더링)은 파일 하단의 `class Component extends DCLogic { ... }` 안에 들어 있습니다. UI는 `React.createElement` 헬퍼(`col`, `row`, `txt` 등)로 그려집니다 — Flutter의 `Column`/`Row`/`Text`에 1:1로 대응됩니다.

## Fidelity
**High-fidelity (hifi)**. 최종 색상·타이포·간격·인터랙션이 모두 확정된 픽셀 단위 목업입니다. 아래 디자인 토큰의 정확한 hex 값과 px 값을 사용해 픽셀에 가깝게 재현하세요.

---

## Design Tokens

### Colors
| 토큰 | Hex | 용도 |
|---|---|---|
| `t1` (text primary) | `#191F28` | 주요 텍스트, 금액 숫자 |
| `t2` (text secondary) | `#6B7684` | 보조 텍스트 |
| `t3` (text tertiary) | `#8B95A1` | 라벨, 캡션 |
| `t4` (text quaternary) | `#B0B8C1` | 가장 약한 텍스트, 비활성 아이콘 |
| `line` (divider) | `#F1F3F5` | 구분선, 진행바 트랙 |
| `bg` (surface gray) | `#F2F4F6` | 섹션 띠, 칩 배경, 보조 버튼 배경 |
| `card` (surface white) | `#FFFFFF` | 화면 배경 |
| `brand` | `#3182F6` | 강조 색(파랑), 활성 탭, 링크 |
| `tint` | `#EAF2FE` | 브랜드 연한 배경(나도 보유 뱃지, 내 랭킹 행) |
| **up (상승/이익)** | `#F04452` | **양수 수익 — 빨강 (한국 관습)** |
| **down (하락/손실)** | `#3182F6` | **음수 수익 — 파랑 (한국 관습)** |

> ⚠️ 한국 증시 관습에 따라 **상승=빨강, 하락=파랑**입니다. 미국식(상승=초록)과 반대이니 반전하지 마세요. 규칙: `color = value >= 0 ? up(#F04452) : down(#3182F6)`.

### Typography
- **Font family**: `Pretendard` (Variable). 폰트 패밀리 전체를 앱에 번들하세요 (pub: `pretendard` 폰트 에셋 또는 직접 추가).
- 숫자는 **tabular-nums** (고정폭 숫자) 적용 — 금액 정렬이 깔끔해집니다. Flutter: `fontFeatures: [FontFeature.tabularFigures()]`.
- Scale (size / weight):
  - 총 자산 대형 숫자: 34 / 800, letter-spacing −0.8
  - 화면 타이틀(피드·랭킹 등): 22 / 800
  - 헤더 타이틀("내 자산"): 18 / 800
  - 종목상세 가격: 28 / 800
  - 섹션 타이틀: 15–17 / 800
  - 종목명: 15 / 700
  - 본문/값: 14–15 / 600–700
  - 라벨·캡션: 11–13 / 500–600
  - 탭바 라벨: 11 / 500(비활성)·700(활성)

### Spacing & Radius
- 화면 좌우 패딩: **20px**
- 섹션 세로 패딩: 14–18px, 구분선 위아래 margin 4px
- 칩 패딩: 6×11px, radius 9
- 칩/버튼 radius: 8–10, 진행바 radius: 4–6
- 아바타: 원형(반지름 = 크기/2), 종목 로고: radius = 크기×0.28
- 그림자: 거의 없음(플랫). 폰 베젤만 큰 그림자 사용.

### Iconography
선형(stroke) 아이콘, stroke-width 1.8–2.2, 24px 기준. 사용 아이콘: 뒤로(back), 화살표(chev), 눈/눈가림(eye/eyeoff), 자물쇠(lock), 공유(share), 막대(bars=자산탭), 사람들(users=피드탭), 트로피(award=랭킹탭), 하트(heart), 말풍선(msg), 별(star). Flutter는 `Icons` 또는 `lucide_icons` 패키지로 대체 가능.

---

## Data Model

### Holding (보유 종목)
```
id        String      // 'aapl'
name      String      // 'Apple' / '삼성전자'
ticker    String      // 'AAPL' / '005930'
market    'US' | 'KR'
color     String      // 차트/로고 색 (#4C6EF5 등)
shares    int         // 보유 수량
avgPrice  double      // 평균 단가 (현지 통화)
curPrice  double      // 현재가 (현지 통화)
dayPct    double      // 일간 등락률 %
currency  '$' | '₩'
```
파생 값 (계산):
- 환율 상수 `KRW = 1380` (USD→KRW)
- `mult = currency=='$' ? KRW : 1`
- `value = shares * curPrice * mult` (원화 평가액)
- `cost  = shares * avgPrice * mult`
- `pnl   = value - cost` (총 평가손익)
- `ret   = (curPrice - avgPrice) / avgPrice * 100` (총 수익률 %)
- `dayPnl = value * dayPct / 100` (일간 수익 금액)
- `weight = value / totalValue * 100` (포트폴리오 비중 %)

포트폴리오 합계: `total = Σ value`, `cost = Σ cost`, `pnl = total - cost`, `ret = pnl/cost*100`, `dayPnl = Σ dayPnl`, `dayPct = dayPnl/total*100`.

**시드 데이터 (6종목, value 내림차순 정렬해 표시):**
| name | ticker | mkt | shares | avg | cur | dayPct | ccy | color |
|---|---|---|---|---|---|---|---|---|
| Apple | AAPL | US | 60 | 182 | 234 | +1.1 | $ | #4C6EF5 |
| NVIDIA | NVDA | US | 50 | 98 | 172 | +3.2 | $ | #15AABF |
| Tesla | TSLA | US | 30 | 245 | 298 | −0.8 | $ | #FF8787 |
| 삼성전자 | 005930 | KR | 120 | 68000 | 79200 | +0.9 | ₩ | #20C997 |
| SK하이닉스 | 000660 | KR | 40 | 152000 | 198500 | +2.4 | ₩ | #FAB005 |
| NAVER | 035420 | KR | 25 | 210000 | 188000 | −1.2 | ₩ | #9775FA |

### Friend (친구)
```
id, name, short(이니셜), color
ret      double   // 전체 수익률 %
time     String   // '2시간 전'
likes    int, comments int
hold: [ { n:종목명, w:비중%, r:수익률% } ]   // 금액 없이 비중만
```
시드: 김재현(+42.3), 이수민(+31.8), 정유진(+18.5), 최민서(+12.1), 강태형(−3.4). 각자 4–5개 종목의 비중/수익률 보유 (파일의 `friends()` 참고).

### Me (랭킹용)
`{ name:'나 (지훈)', ret: 27.7, isMe: true }` — 친구 목록에 합쳐 수익률 내림차순 정렬.

---

## Screens / Views

앱은 하단 **3-탭 네비게이션**(자산 / 피드 / 랭킹)을 기본 골격으로 합니다. 자산 탭에서 보유종목→종목상세, 피드 탭에서 친구→친구 포트폴리오로 push 네비게이션됩니다.

### 1. 자산 홈 (Assets Home) — 기본 화면
- **Purpose**: 총 자산, 손익, 자산 비중, 보유 종목 전체를 한 화면에서 확인.
- **Layout**: 흰 배경, 좌우 패딩 20px. 카드 없이 **구분선(1px #F1F3F5)** 으로 섹션 분리하는 플랫 레이아웃. 섹션 사이에 가끔 8px 회색 띠(`#F2F4F6`, 좌우로 화면 끝까지 −20px margin).
- **Components (위→아래)**:
  1. **헤더 행**: 좌측 "내 자산"(18/800), 우측 눈 토글 버튼 + 공유 버튼(각 36px 원형, 배경 `#F2F4F6`).
  2. **총 자산**: 라벨 "총 자산"(13/600 #8B95A1) → 금액 `₩65,724,400`(34/800, letter-spacing −0.8). 아래 pill 2개 — "오늘 +1.1%"(상승색), "총 수익 +27.7%"(상승색). pill = 라벨+값, 배경은 값 색의 8% 투명도, padding 7×12, radius 10.
  3. 구분선.
  4. **손익 2열**: "오늘 수익 +₩713,902" | (세로 1px 구분선) | "총 평가손익 +₩14,259,800". 각 17/800, 값 색 적용, `whiteSpace: nowrap`.
  5. 구분선.
  6. **자산 비중**: 섹션 타이틀 → 가로 **스택바**(높이 12, 종목별 색, 2px gap, radius 6) → 상위 4종목 범례 행(색 점 9px + 종목명 + 비중%).
  7. 8px 회색 띠.
  8. **보유 종목 N**: 타이틀 "보유 종목 6". 그 아래 **정렬 칩 5개**(아래 인터랙션 참고). 그 아래 **보유 종목 전체 리스트**(아래 행 구조).

  **보유 종목 행 구조** (탭하면 종목상세로 이동):
  - 상단 행: 종목 로고(38px, 배경=색 10%, 글자=색) + (종목명 15/700, 그 아래 "60주 · 비중 35.0%" 12/500 #8B95A1) + 우측 정렬(평가액 15/800, 그 아래 "평가액" 11/600 #B0B8C1).
  - 하단 행: 2개 미니 블록(배경 `#F2F4F6`, radius 10, padding 8×11) — "총수익 +₩9,360,000 +47.5%" / "일간수익 +₩142,200 +1.1%". 금액 13/700, % 11.5/700, 모두 값 색.
  - 행 사이 1px 구분선(마지막 행 제외).

### 2. 종목 상세 (Stock Detail)
- **Purpose**: 개별 종목의 가격 추이와 내 보유 현황 확인.
- **Layout**: 상단 뒤로가기 헤더(좌측 back, 가운데 종목명, 우측 별 아이콘).
- **Components**: 로고+마켓/티커 → 종목명(22/800) → 현재가(28/800)+오늘 등락률 → **라인 차트(스파크라인, 영역 그라데이션, 높이 150)** → 기간 탭(1일/1주/1개월/1년/전체, 선택된 것만 검정 배경 칩) → "내 보유 현황" 박스(배경 `#F2F4F6`, radius 16): 보유 수량 / 평균 단가 / 평가 금액 / 비중 행 + 굵은 구분선 아래 평가 손익 → 하단 매도(회색)·매수(빨강 #F04452) 버튼.

### 3. 친구 피드 (Feed)
- **Purpose**: 친구들이 공유한 포트폴리오 둘러보기.
- **Layout**: 타이틀 "친구 피드"(22/800) + 부제. 그 아래 친구 카드 리스트(카드: 흰 배경, 1px #F1F3F5 보더, radius 18, padding 16, gap 13).
- **카드 구성**: 아바타(42px 원형, 이니셜) + 이름/시간 + 우측 수익률 뱃지(값 색 8% 배경). 그 아래 스택바(높이 9) + 상위 3종목 범례. 하단 행: 좌측 하트+개수, 말풍선+개수 / 우측 "포트폴리오 보기 ›"(brand 색, 탭하면 친구 포트폴리오로 이동).

### 4. 친구 포트폴리오 (Friend Portfolio)
- **Purpose**: 친구 1명의 포트폴리오를 비중만(금액 비공개) 상세 보기.
- **Components**: 아바타 52px + 이름 + "🔒 비중만 공개" 뱃지 + 우측 수익률(22/800). → 도넛 차트(160px, 가운데 종목 수). → "보유 비중" 리스트: 각 종목 색 점 + 종목명 + (내가도 보유한 종목이면 "나도 보유" 뱃지, brand tint 배경) + 가로 진행바(비중) + 우측 비중% & 수익률. **금액은 어디에도 표시하지 않음** — 비중·수익률만.

### 5. 수익률 랭킹 (Ranking)
- **Purpose**: 친구들과 수익률 비교.
- **Components**: 타이틀 "수익률 랭킹"(22/800) + "이번 달 · 친구 5명과 비교". 수익률 내림차순 행 리스트. 각 행: 순위(1–3위는 금/은/동 원형 뱃지 색 #F7B500/#9AA5B1/#CD8B5B, 그 외 숫자) + 아바타 40px + 이름/상태 + 우측 수익률(17/800 값 색). **내 행**은 brand tint 배경 + brand 보더 + "나" 뱃지로 강조. 친구 행 탭 시 해당 친구 포트폴리오로 이동.

---

## Interactions & Behavior

### 금액 숨기기 (Privacy / Hide amounts)
- 헤더의 **눈 아이콘**으로 토글. ON이면 모든 **금액**(₩ 숫자)을 `••••••`로 가림. **비중(%)·수익률(%)은 그대로 노출**.
- 함수 규칙: `won(n, hide) => hide ? '••••••' : '₩'+formatted`, `swon(n, hide) => hide ? '••••' : (n>=0?'+':'-')+'₩'+abs`.
- 친구 포트폴리오는 **항상 금액 비공개**(비중·수익률만). 이게 핵심 공유 정책 — 내 금액은 숨기고 비중만 친구와 공유.

### 보유 종목 정렬 (Sorting)
- 칩 5개: **평가액 / 총수익 / 총수익률 / 일간수익 / 일간수익률** → 각각 정렬 키 `value / pnl / ret / dayPnl / day`.
- 같은 칩을 **다시 누르면 오름/내림차순 토글**. 활성 칩에 `↓`(desc)·`↑`(asc) 화살표 표시, 배경 검정(#191F28)·글자 흰색. 비활성 칩은 회색 배경·회색 글자.
- 기본값: **평가액 내림차순(value, desc)**.
- 정렬 로직: `holdings.sort((a,b) => (a[key]-b[key]) * (desc ? -1 : 1))`.

### Navigation
- 하단 탭(자산/피드/랭킹) 전환 시 해당 탭의 루트 화면으로, 히스토리 초기화.
- 보유 종목 행 → 종목상세 (push). 피드 카드 "포트폴리오 보기" / 랭킹 친구 행 → 친구 포트폴리오 (push). 뒤로가기 헤더로 pop.

## State Management
- `tab`: 'assets' | 'feed' | 'ranking'
- `view`: 현재 화면, `param`: 선택된 종목/친구 id, `hist`: 뒤로가기 스택
- `hide`: bool (금액 숨김)
- `sortKey`: 'value'|'pnl'|'ret'|'dayPnl'|'day', `sortDir`: 'asc'|'desc'
- Flutter 권장: `Riverpod` 또는 `Provider`로 포트폴리오/정렬/숨김 상태 관리. 시세는 추후 증권사 API(예: 한국투자증권 OpenAPI) 연동 자리만 모델에 비워두기.

## Charts
- **도넛**: 종목별 비중. `fl_chart`의 `PieChart`(centerSpaceRadius로 도넛, 가운데 텍스트 오버레이).
- **스택 가로 바**: 비중 누적. `Row` + flex 비율 위젯 또는 커스텀 페인터.
- **스파크라인**(종목상세): `fl_chart`의 `LineChart` + 영역 그라데이션.
- 차트 색은 종목 `color` 사용.

## Assets
- 외부 이미지 없음. 모든 그래픽은 코드로 렌더(차트·아이콘·아바타 이니셜·종목 로고는 색 배경+글자). 별도 이미지 에셋 불필요.
- 폰트: Pretendard Variable 번들 필요.

## Files
- `주식 포트폴리오 공유 앱.dc.html` — 전체 디자인/로직. `homeB()` = 자산 홈, `stockScreen()` = 종목상세, `feedScreen()` = 피드, `friendScreen()` = 친구 포트폴리오, `rankingScreen()` = 랭킹, `buildPortfolio()`/`friends()` = 데이터, `setSort()`/`sortBy()` = 정렬, `won()`/`swon()` = 금액 숨김 포맷.
