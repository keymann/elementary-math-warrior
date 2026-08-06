# elementary-math-warrior

초등 수학 서바이버형 학습 게임. 이동만 조작하고 공격은 자동, 레벨업 때 수학 문제를 풀어 강화를 얻는다.

- 배포: **Cloudflare Workers Static Assets** (`wrangler.jsonc`, assets-only)
- 문서: [`docs/수학서바이버-클론-작업계획.md`](docs/수학서바이버-클론-작업계획.md) · [`docs/수학서바이버-블랙박스-측정표.md`](docs/수학서바이버-블랙박스-측정표.md)

## 현재 상태

**Phase 1 — 엔진 스캐폴드**. 전투·무기·퀴즈 연결은 Phase 2~3.

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
| `src/game/world.ts` | 플레이어·적 추적·분리·스폰 |

### 측정 결과 (데스크톱 Chromium)

| 동시 적 | 평균 fps | 프레임 시간 |
|---|---|---|
| 100 | 60 | 0.55 ms |
| **300** | **60** | **1.04 ms** |
| 600 | 60 | 1.38 ms |

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
