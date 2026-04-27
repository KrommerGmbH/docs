---
nav:
  title: "카테고리: Architecture & Support Code"
  position: 190

---

# 카테고리: Architecture & Support Code + 폴더 최적화

==========================================

==========================================

==========================================

> 목적: 기능 외 지원 코드(엔트리/라우팅/관측/테스트)와 폴더 정리 포인트를 함께 문서화

---

## A. 아키텍처/지원 코드 핵심

----------------

----------------

----------------

### ARC-01 Renderer ↔ Engine 경계 명확화

-------------------------------

-------------------------------

-------------------------------

- 현재 구조: Renderer는 store/service 중심, Engine은 API/오케스트레이션 중심
   - 핵심 경계:
  - Renderer 전송 진입: `src/renderer/app/store/chat.store.ts`
  - Engine API 진입: `src/engine/server/routes.ts`, `src/engine/server/routes/chat-generate.route.ts`
   - 운영 포인트: 경계 레이어에 request-id 공통 로그 키를 고정하면 추적성이 크게 상승

### ARC-02 스트림 프로토콜 파서 단일화

----------------------

----------------------

----------------------

- 현재 구조: `src/shared/ai-stream/protocol-parser.ts`가 SSE + Data Stream 모두 처리
   - 장점: renderer/engine 양측이 같은 이벤트 계약을 공유 가능
   - 운영 포인트: 신규 이벤트 타입은 parser에서 먼저 타입 확장 후 store 반영

### ARC-03 운영 진단 엔드포인트 세트

---------------------

---------------------

---------------------

- health: `/health`, `/api/health`
   - metrics: `/api/metrics`, `/api/metrics/summary`
   - docs: `/api/openapi.json`, `/api/docs`
   - scheduler: `/api/scheduler/timeline`
   - queue diagnostics: `/api/queue/diagnostics` (routes 구성 의존)

### ARC-04 테스트 경로 표준화 유지

--------------------

--------------------

--------------------

- 원칙: 테스트 소스는 `tests/**` 단일 루트 사용
   - 금지: `src/renderer/tests/**` 재도입
   - 권장: engine 단위 테스트(`tests/engine/**`)와 renderer E2E(`tests/renderer/**`)를 계속 분리

---

## B. 폴더/파일 최적화 제안 (이번 검색 기준)

--------------------------

--------------------------

--------------------------

### OPT-01 `docs/` 인덱스 자동 동기화 스크립트 도입

---------------------------------

---------------------------------

---------------------------------

- 문제: 문서가 늘면 README 링크 누락 가능
   - 제안: `scripts/docs/generate-doc-index.ts`로 `feature-category-*.md` 자동 수집
   - 기대효과: 신규 카테고리 문서 추가 시 누락 방지

### OPT-02 워크플로우 상세 파일 역할 분리

------------------------

------------------------

------------------------

- 문제: `cmh-workflow-detail/index.ts`가 편집기 + 모니터링 + 타임트래블 로직을 모두 보유
   - 제안:
  - `workflow-editor.composable.ts`
  - `workflow-monitoring.composable.ts`
  - `workflow-snapshot.composable.ts`
   - 기대효과: 파일 길이 축소, 테스트 가능성 증가

### OPT-03 chat store 보조 모듈 분리

--------------------------

--------------------------

--------------------------

- 문제: `chat.store.ts`가 모델 로딩/스트림 캐시/전송/영속화 결정을 다수 포함
   - 제안:
  - `chat-model-selection.policy.ts`
  - `chat-stream-render-cache.ts`
  - `chat-send.pipeline.ts`
   - 기대효과: 정책 변경 시 영향 범위 축소

### OPT-04 보안/운영 미들웨어 디렉터리 통일

-------------------------

-------------------------

-------------------------

- 문제: 일부 운영 정책은 routes 내부, 일부는 middleware 디렉터리로 분산
   - 제안: `src/engine/server/middleware/{rate-limit,webhook-auth,request-id}.ts`로 표준화
   - 기대효과: 라우트 파일 가독성 개선, 재사용 쉬움

### OPT-05 discovery 관련 타입 재배치

--------------------------

--------------------------

--------------------------

- 문제: discovery 후보 타입이 여러 계층에서 중복 사용될 여지
   - 제안: `src/shared/discovery/route-types.ts`로 공용 타입 추출
   - 기대효과: renderer/engine 간 타입 재사용 강화

---

## C. 정리 우선순위 제안

-------------

-------------

-------------

1. 단기(즉시): OPT-01, OPT-04
2. 중기(다음 리팩터): OPT-02, OPT-03
3. 장기(아키텍처 정리): OPT-05
