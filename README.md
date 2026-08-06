# elementary-math-warrior

초등 수학 서바이버형 학습 게임. 이동만 조작하고 공격은 자동, 레벨업 때 수학 문제를 풀어 강화를 얻는다.

- 배포: **Cloudflare Workers Static Assets** (`wrangler.jsonc`, assets-only)
- 문서: [`docs/수학서바이버-클론-작업계획.md`](docs/수학서바이버-클론-작업계획.md) · [`docs/수학서바이버-블랙박스-측정표.md`](docs/수학서바이버-블랙박스-측정표.md)

## 현재 상태

**Phase 6 — 백엔드 · PWA**. 밸런싱·QA는 Phase 7.

```bash
npm install
npm run dev        # → http://localhost:5173       게임 (엔진 스캐폴드)
                   #   http://localhost:5173/poc.html  어댑터 PoC 검수 페이지
npm run typecheck
npm run build      # dist/ (index.html + poc.html + 404.html + _headers)
npm run deploy     # 빌드 후 wrangler deploy
```

> **배포 환경의 PoC 경로는 `/poc`** 입니다. Cloudflare 정적 자산이 `.html`을 확장자 없는
> 경로로 정규화하므로(`html_handling: auto-trailing-slash`) `/poc.html`은 307로 `/poc`에
> 리다이렉트됩니다. Vite dev 서버에서는 파일 경로 그대로 `/poc.html`로 접속합니다.

`npm run dev`는 `host: true`로 열리므로 같은 네트워크의 실제 모바일·태블릿에서 접속해 확인할 수 있다.

### 엔진 구조

| 파일 | 역할 |
|---|---|
| `src/core/loop.ts` | 고정 타임스텝(1/60) 루프. 렌더는 보간 |
| `src/core/input.ts` | 키보드 / 터치 / 마우스 → 단일 정규화 벡터. 플로팅 조이스틱 공유 |
| `src/core/pool.ts` | 오브젝트 풀 (GC 스파이크 방지) |
| `src/core/spatial.ts` | 균일 그리드 브로드페이즈 충돌 |
| `src/core/rng.ts` | 시드 난수 (리플레이·검증 전제) |
| `src/render/viewport.ts` | DPR 상한 2, safe-area, 회전 시 시야 보정, 카메라 |
| `src/render/draw.ts` | 이모지 스프라이트 캐시, 무한 격자, 조이스틱 |
| `src/game/balance.ts` | 모든 밸런스 수치 (여기 한 곳에만) |
| `src/game/world.ts` | 전투 루프 — 스폰·발사·충돌·보석·레벨업 |
| `src/game/weapons.ts` | 무기 정의 (파일럿 6종). `spec(level)` + `fire()` |
| `src/game/projectiles.ts` | 투사체 풀. 중복 타격 방지(pid) |
| `src/game/stats.ts` | 패시브 → 파생 스탯 파이프라인 |
| `src/game/enemies.ts` | 적 4종 (등장 시각·가중치) |
| `src/game/waves.ts` | 스폰 밀도·체력 스케일 |
| `src/game/upgrades.ts` | 레벨업 보상 풀 (각성 짝꿍 힌트 포함) |
| `src/game/evolution.ts` | 각성 판정 — 무기 Lv.5 + 짝꿍 패시브 |
| `src/quiz/selector.ts` | 출제 정책 — 학년→학기군, 유형 균등, 오답 재출제 |
| `src/quiz/extra.ts` | 보완 생성기 — 규칙 찾기·막대그래프·도형의 이동 |
| `src/ui/overlays.ts` | 퀴즈 · 강화 카드 · 각성 연출 |
| `src/game/director.ts` | 타임라인 — 보스·초월·특수 몬스터 큐 |
| `src/game/boss.ts` | 보스 3종 + 최종보스 방어막 |
| `src/game/pickups.ts` | 특수 아이템 — 생선·자석·폭탄 |
| `src/ui/screens.ts` | 시작 · 게임 방법 · 도감 · 일시정지 · 결과 화면 |
| `src/meta/save.ts` | 최고 기록 · 이어하기 · 별명 (localStorage) |
| `src/worker/index.ts` | Cloudflare Worker — 정적 자산 + 랭킹 API + 점수 검증 |
| `src/net/leaderboard.ts` | 랭킹 클라이언트 (실패해도 게임을 막지 않음) |
| `migrations/0001_init.sql` | D1 스키마 |

### 랭킹 서버 최초 1회 설정

`wrangler.jsonc` 의 `d1_databases` 는 **주석 처리되어 있다.** 존재하지 않는 database_id 로
배포하면 런타임에 조용히 깨지기 때문이다. 이 상태에서도 게임은 정상 동작하고 랭킹 API 만
503 을 돌려준다.

```bash
npx wrangler d1 create elementary-math-warrior          # 출력된 UUID 를 복사
# wrangler.jsonc 의 d1_databases 주석을 풀고 database_id 에 붙여넣기
npx wrangler d1 migrations apply elementary-math-warrior --remote
```

로컬 확인:

```bash
npx wrangler d1 execute elementary-math-warrior --local --file=migrations/0001_init.sql
npx wrangler dev        # http://localhost:8787
```

### 10분 타임라인

| 시각 | 이벤트 |
|---|---|
| 0:13~ | ⭐ 별 몬스터 (38초 주기) — 처치 시 보너스 문제 → 자석/폭탄 드랍 |
| 0:42~ | 🐈 생선 도둑 고양이 (55초 주기) — 처치 시 생선 드랍(회복) |
| 3:00 | 중간보스 1 · 곱셈 골렘 **(전투 중 타이머 정지)** |
| 6:00 | 중간보스 2 · 나눗셈 마녀 **(타이머 정지)** |
| 8:00 | 초월 수련 — 특별 문제 3개 (맞힌 수만큼 초월 강화) |
| 9:00 | 초월 — 파워스파이크 + 완전 회복 |
| 10:00 | 최종보스 · 유령 마왕 — **방어막을 문제로 해제** |

### 측정 결과 (데스크톱 Chromium)

**성능**

| 동시 적 | 평균 fps | 프레임 시간 |
|---|---|---|
| 100 | 60 | 0.55 ms |
| **300** | **60** | **1.04 ms** |
| 600 | 60 | 1.38 ms |

**10분 전체 루프** (무적 모드, 자동 조작) — `cleared` 도달, 최종 **Lv.19 / 3,130킬 / 60fps(0.91ms)**

| 시각 | Lv | 누적 처치 | 동시 적 |
|---|---|---|---|
| 1분 | 5 | 132 | 92 |
| 3분 | 8 | 483 | 140 |
| 5분 | 10 | 874 | 185 |
| 8분 | 16 | 2,020 | 254 |
| 10분 | **19** | **3,130** | 300 |

레벨업 18회로 목표(15~20회) 안에 든다.

**조작 숙련도에 따른 생존** — 같은 밸런스에서 조작 방식만 바꾼 결과

| 조작 | 결과 |
|---|---|
| 3초마다 90° 회전 (제자리 맴돎) | 36~46초 사망 |
| 넓은 원형 카이팅 | 175초 제한시간까지 **무사망** |

조작: 키보드 210 단위/초 정확, 대각선 속도 이득 없음(207), 데드존 3px 무반응, ESC 일시정지 중 이동 0.

## 퀴즈 어댑터

문제는 신규 집필하지 않고 사내 기존 프로젝트(`low-grade-operator-exercise-web`)의 **문제 생성기를 재사용**한다.
`src/vendor/problems.js`가 그 이식본이며 **수정하지 않는다**(원본과 동기화 가능하도록).

원본은 주관식 빈칸 입력용이라, 게임에 필요한 4지선다로 바꾸는 어댑터가 유일한 신규 작업이다.

| 파일 | 역할 |
|---|---|
| `src/quiz/adapter.ts` | 답란 구조 판별 → 4지선다 변환 |
| `src/quiz/distractors.ts` | 오답 보기 생성 (초등 오답 패턴 재현 + 크기 순위 제어) |
| `src/poc/main.ts` | 검수 페이지 — 75개 유형 샘플 + 품질 지표 |

### 품질 기준

오답이 "그럴듯해 보이는 것"만으로는 부족하다. 아래 지표를 PoC 페이지 상단에서 상시 확인한다.

- 변환 성공률 **전 유형 100%**
- 정답 위치 분포 **각 25%**
- **정답이 최댓값/최솟값인 비율 각 25%** — 한쪽으로 몰리면 "제일 큰 보기는 피하면 된다"는 편법이 성립한다
- 보기 중복 **0**

## 라이선스 · 참고

레퍼런스로 분석한 원작(수학 서바이버)은 저작권으로 보호되며 코드를 복제하지 않았다.
분석은 화면에 표시되는 정보만 사용한 블랙박스 방식이다. 자세한 경계는 작업계획 문서 0장 참고.
