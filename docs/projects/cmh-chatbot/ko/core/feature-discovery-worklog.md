# CMH Chatbot 기능 확장 검색 작업 로그

> 목적: 기존 62개 기능 문서 외에, 프로젝트 코드에서 실제 구현된 추가 기능/지원 로직을 찾아 문서화한다.
> 기준 경로: `src/**`, `tests/**`, `docs/**`

---

## 1) 발견 기능 리스트 (검색 중 실시간 기록)

| 번호 | 기능 이름 | 짧은 설명 | 근거 파일 |
| :--- | :--- | :--- | :--- |
| 1 | 스트림 Hidden Message Policy | 스트림 파서가 `hidden`/`do-not-render` 이벤트를 감지해 UI 렌더를 차단한다. | `src/shared/ai-stream/protocol-parser.ts` |
| 2 | Tool Event Timeline 파싱 | `tool-start/end/error` 이벤트를 표준 구조로 변환해 타임라인 카드 렌더링에 전달한다. | `src/shared/ai-stream/protocol-parser.ts` |
| 3 | 채팅 스트림 렌더 캐시 프레임 플러시 | delta를 즉시 DOM 반영하지 않고 `_streamRenderCache`에 모아 `requestAnimationFrame`으로 flush한다. | `src/renderer/app/store/chat.store.ts` |
| 4 | 대화 분기(Time-Travel/Fork) 메타 | 대화에 `parentId`, `forkFromMessageId` 메타를 보관해 포크 기반 시나리오를 지원한다. | `src/renderer/app/store/chat.store.ts` |
| 5 | 로컬 모델 KeepAlive/Warmup | 로컬 모델을 주기적으로 점검하고 필요 시 자동 warmup해 cold start를 줄인다. | `src/renderer/app/store/chat.store.ts` |
| 6 | STT Whisper 브라우저 추론 | 브라우저 MediaRecorder + Transformers.js Whisper로 음성을 텍스트로 변환한다. | `src/renderer/app/service/stt.service.ts` |
| 7 | TTS 문장 단위 스트리밍 프리페치 | Edge TTS에서 문장 분할 + 다음 문장 프리페치로 체감 지연을 줄인다. | `src/renderer/app/service/tts.service.ts` |
| 8 | TTS 언어 자동 감지 | 입력 텍스트를 정규식 패턴으로 언어 감지해 음성 선택에 반영한다. | `src/renderer/app/service/tts.service.ts` |
| 9 | API Rate Limiting | `/api/chat`, `/api/generate`에 IP 기반 고정 윈도우 제한을 적용한다. | `src/engine/server/routes.ts` |
| 10 | OpenAPI + Swagger UI | `/api/openapi.json`, `/api/docs`로 API 문서와 UI를 자동 노출한다. | `src/engine/server/routes.ts`, `src/engine/server/routes/openapi.ts` |
| 11 | 메트릭 이중 출력 | Prometheus text export + JSON snapshot를 동시에 제공한다. | `src/engine/service/metrics.service.ts`, `src/engine/server/routes.ts` |
| 12 | 캐시 stale fallback | 응답 캐시가 만료돼도 stale window 내면 fallback 응답을 허용한다. | `src/engine/service/response-cache.service.ts` |
| 13 | Queue Dead-Letter 처리 | 재시도 소진 작업을 `cmh-inference-dlq`로 이동하고 진단 정보를 노출한다. | `src/engine/queue/manager.ts` |
| 14 | 보안 게이트 이상탐지 | burst-rate/민감 키워드/deny streak를 휴리스틱으로 탐지한다. | `src/engine/agent/security-gate.ts` |
| 15 | Webhook HMAC 인증 미들웨어 | 서명 헤더(`sha256=`)를 검증해 위조 요청을 차단한다. | `src/engine/server/middleware/webhook-auth.ts` |
| 16 | Discovery 라우팅 점수화 | mDNS/Tailscale 후보를 점수화해 최적 엔드포인트를 선택한다. | `src/engine/discovery/routing.ts` |
| 17 | 워크플로우 모니터링 패널 | 노드 메트릭/툴 호출 이력/실행 스냅샷을 UI에서 조회한다. | `src/renderer/module/cmh-workflow/page/cmh-workflow-detail/index.ts` |
| 18 | 워크플로우 Time-travel Snapshot 적용 | 특정 스냅샷을 선택해 노드 상태를 시각적으로 되돌려 점검한다. | `src/renderer/module/cmh-workflow/page/cmh-workflow-detail/index.ts` |
| 19 | 오케스트레이터 동적 부하 분산 | 역할별 `inFlight/failureRate` 기반 점수로 실행 대상을 선택한다. | `src/engine/agent/orchestrator.ts` |
| 20 | LangGraph 스트리밍 상태 경로 | `streamWithGraph()`로 노드 업데이트를 토큰 단위로 스트리밍한다. | `src/engine/agent/orchestrator.ts` |

---

## 2) 그룹핑 초안 (검색 완료 후 작성)

- Chat Experience & UX: 1, 2, 3, 4, 5, 6, 7, 8
- AI Runtime & Orchestration: 19, 20, 12
- Workflow & Admin Tools: 17, 18, 10
- Ops, Security & Reliability: 9, 11, 13, 14, 15, 16

---

## 3) 최종 반영 체크리스트

- [x] README 인덱스 재구성
- [x] 카테고리 그룹 문서 생성
- [ ] 기능별 목적/트리거/프로세스/연관파일/엔티티/라이브러리 작성
- [x] 아키텍처/지원코드 섹션 작성
- [x] 폴더 구조 최적화 제안 작성
