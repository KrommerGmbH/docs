# CMH Chatbot 62개 기능 카탈로그 (현재 구현 기준)

> 기준: 현재 코드 + 기존 plans/docs 통합
> 형식: 초보 개발자 추적용 (트리거/흐름/파일/디버그)

---

## 공통 실행 흐름 ID

### Flow-A: 채팅 요청
```mermaid
flowchart LR
  UI[Renderer Input] --> STORE[chat.store.sendMessage]
  STORE --> API[/api/chat]
  API --> MODEL[Provider/LLM]
  MODEL --> STREAM[delta stream]
  STREAM --> UI2[UI flush + persist]
```

### Flow-B: 모델 목록
```mermaid
flowchart LR
  RENDERER[loadModels] --> LOCAL[/api/local-models]
  RENDERER --> CLOUD[/api/providers/:id/remote-models]
  LOCAL --> MERGE[merge/apply selection]
  CLOUD --> MERGE
  MERGE --> UI[model selector]
```

### Flow-C: 에이전트 그래프
```mermaid
flowchart LR
  CHAT[/api/chat] --> ORCH[orchestrator]
  ORCH --> GRAPH[LangGraph nodes]
  GRAPH --> TOOLS[tool calls]
  TOOLS --> OUT[assistant response]
```

---

## 카탈로그

### F01 (#1) 멀티에이전트 (마이크로에이전트)
- 상태: 적용
- 트리거: 에이전트 선택 후 채팅 전송
- 실행 흐름: Flow-C
- 연관 파일: `src/engine/agent/orchestrator.ts`, `src/engine/agent/harness.ts`
- 연관 기능/라이브러리: LangGraph, LangChain
- 목적: 역할 기반 분기 실행
- 장애 추적: orchestrator agent selection/runtime 점수 로그 확인

### F02 (#2) 사용자 심리분석 에이전트
- 상태: 부분 적용
- 트리거: 대화 후 분석 파이프라인 훅
- 실행 흐름: Flow-C
- 연관 파일: `src/engine/langchain/callbacks/profiler.handler.ts`
- 연관 기능/라이브러리: callbacks
- 목적: 사용자 성향/패턴 분석 기반 보조
- 장애 추적: profiler callback 등록 여부 확인

### F03 (#3) RAG 문서 파이프라인
- 상태: 적용
- 트리거: 문서 로드/분할/검색 요청
- 실행 흐름: Flow-C
- 연관 파일: `src/engine/langchain/rag/document-pipeline.ts`, `src/engine/langchain/rag/vector-store.adapter.ts`
- 연관 기능/라이브러리: LangChain loaders/splitters/vector
- 목적: 문서 기반 답변 강화
- 장애 추적: loader->split->embed 단계별 로그 확인

### F04 (#4) 사용자 AI 모델 평가(SAD)
- 상태: 부분 적용
- 트리거: 응답 평가/후처리
- 실행 흐름: Flow-A 후 평가 저장
- 연관 파일: `src/renderer/app/service/conversation.service.ts`(rating)
- 목적: 응답 품질 피드백 축적
- 장애 추적: rating persist 실패 확인

### F05 (#6) AI 답변 Rich UI 렌더링
- 상태: 적용
- 트리거: 스트리밍 delta 수신
- 실행 흐름: Flow-A
- 연관 파일: `src/renderer/app/component/structure/cmh-chat-shell/sub/cmh-chat-message/**`
- 목적: 코드/이미지/블록/툴 이벤트 시각화
- 장애 추적: hidden/toolEvents/artifact 패널 바인딩 확인

### F06 (#7) 모바일 PWA/반응형
- 상태: 부분 적용
- 트리거: 모바일 viewport
- 실행 흐름: renderer layout
- 연관 파일: `cmh-chat-shell.scss`, `cmh-chat-input.scss`
- 목적: 모바일 입력/사이드바 사용성
- 장애 추적: 44px 터치 타겟, overflow 여부 확인

### F07 (#8) Workflow 에디터 & 모니터링
- 상태: 부분 적용
- 트리거: workflow 모듈 진입
- 실행 흐름: Flow-C
- 연관 파일: `src/renderer/module/cmh-workflow/**`, `src/engine/langchain/graph/**`
- 목적: 그래프 기반 실행 관리
- 장애 추적: node 정의/edge validate 실패 확인

### F08 (#9) ACL 권한 제어
- 상태: 부분 적용
- 트리거: 관리 기능 접근
- 실행 흐름: renderer/module 권한 체크
- 연관 파일: `src/renderer/module/**`, DAL criteria
- 목적: 기능 접근 제어
- 장애 추적: 메뉴/라우트 노출 조건 확인

### F09 (#10) DB 어댑터(SQLite/MySQL)
- 상태: 적용(중심은 SQLite)
- 트리거: DAL read/write
- 실행 흐름: RepositoryFactory -> adapter
- 연관 파일: `src/engine/data/sqlite-adapter.ts`
- 목적: 엔티티 저장/조회
- 장애 추적: criteria pushdown fallback 경로 확인

### F10 (#12) i18n 다국어
- 상태: 적용
- 트리거: locale 변경
- 실행 흐름: language switch -> i18n
- 연관 파일: `src/renderer/app/init/i18n.ts`, `snippet/*.json`
- 목적: 5개 로케일 제공
- 장애 추적: 키 누락/mergeMessages 등록 확인

### F11 (#13) MCP 서버
- 상태: 부분 적용
- 트리거: MCP 설정/요청
- 실행 흐름: service registry
- 연관 파일: `src/engine/service/mcp.service.ts`
- 목적: 외부 도구 서버 확장
- 장애 추적: registry 등록/연결 실패 로그 확인

### F12 (#14) 스케줄러/CronJob
- 상태: 적용
- 트리거: 스케줄 시간 도달
- 실행 흐름: scheduler -> executor -> hooks
- 연관 파일: `src/engine/service/scheduler.ts`
- 목적: 자동 작업 실행
- 장애 추적: run history/timeline 데이터 확인

### F13 (#15) Docker 설치 지원
- 상태: 적용
- 트리거: 컨테이너 실행
- 실행 흐름: cli/server boot
- 연관 파일: `Dockerfile`, `docker-compose.yml`
- 목적: 배포 단순화
- 장애 추적: health endpoint/port 매핑 확인

### F14 (#16) 외부 개발자 확장 아키텍처
- 상태: 부분 적용
- 트리거: plugin/module 추가
- 실행 흐름: module registry 패턴
- 연관 파일: `src/renderer/module/**`, `src/renderer/app/router/**`
- 목적: 기능 확장성
- 장애 추적: 라우트 등록/스니펫 등록 여부 확인

### F15 (#17) LangChain/LangGraph 호환
- 상태: 적용
- 트리거: graph/agent 실행
- 실행 흐름: Flow-C
- 연관 파일: `src/engine/langchain/**`
- 목적: 표준 AI orchestration
- 장애 추적: checkpointer fallback 경고 확인

### F16 (#18) Admin UI(Meteor)
- 상태: 적용
- 트리거: renderer UI 렌더
- 실행 흐름: component mount
- 연관 파일: `src/renderer/app/component/**`
- 목적: 일관된 관리 UI
- 장애 추적: mt-* props/slot mismatch 확인

### F17 (#19) 다중 AI Provider
- 상태: 적용
- 트리거: model/provider 선택
- 실행 흐름: Flow-B + `/api/chat`
- 연관 파일: `chat-generate.route.ts`, `routes.ts`
- 목적: cloud/local 혼합
- 장애 추적: provider key/fallback resolve 확인

### F18 (#20) 로컬 모델 지원
- 상태: 적용
- 트리거: local model 선택
- 실행 흐름: Flow-B
- 연관 파일: `routes.ts:/api/local-models`, `ai-client.service.ts`
- 목적: 오프라인/로컬 추론
- 장애 추적: 모델 파일 경로/llama-server 상태 확인

### F19 (#21) Self/Cloud 모드
- 상태: 적용
- 트리거: providerType 분기
- 실행 흐름: resolveInferenceTarget
- 연관 파일: `chat-generate.route.ts`
- 목적: 실행 환경 유연성
- 장애 추적: providerType 오판정 여부 확인

### F20 (#22) 보안 게이트
- 상태: 적용
- 트리거: agent 실행 전후
- 실행 흐름: security gate 검사
- 연관 파일: `src/engine/agent/security-gate.ts`
- 목적: 이상 패턴 탐지
- 장애 추적: anomaly diagnostics/log 확인

### F21 (#23) 파일 첨부 시스템
- 상태: 적용
- 트리거: 파일 선택 후 전송
- 실행 흐름: chat.store 첨부 파싱->본문 병합
- 연관 파일: `attachment-parser.service.ts`, `chat.store.ts`
- 목적: 텍스트/이미지 컨텍스트 전달
- 장애 추적: dataUrl 생성/토큰 예산 초과 확인

### F22 (#24) 작업 큐 시스템
- 상태: 적용
- 트리거: 비동기 작업 enqueue
- 실행 흐름: queue manager -> worker
- 연관 파일: `src/engine/queue/manager.ts`
- 목적: 재시도/지연 처리
- 장애 추적: DLQ/diagnostics endpoint 확인

### F23 (#25) 서비스 레지스트리/모니터링
- 상태: 부분 적용
- 트리거: 서비스 초기화
- 실행 흐름: metrics/logging callbacks
- 연관 파일: `metrics.service.ts`, `stream-event-monitor.ts`
- 목적: 운영 가시성
- 장애 추적: snapshot/export 지표 확인

### F24 (#26) 웹 검색 에이전트
- 상태: 부분 적용
- 트리거: 툴 호출
- 실행 흐름: Flow-C + tools
- 연관 파일: `src/engine/langchain/tools/**`
- 목적: 외부 정보 보강
- 장애 추적: tool schema/timeout 확인

### F25 (#27) 프록시 IP 서버
- 상태: 부분 적용(분리 프로젝트 연계)
- 트리거: 네트워크 라우팅
- 실행 흐름: discovery routing
- 연관 파일: `src/engine/discovery/routing.ts`
- 목적: 우회/연결 안정성
- 장애 추적: preferred route 로그 확인

### F26 (#28) MCP 브라우저 래퍼
- 상태: 부분 적용
- 트리거: MCP 도구 호출
- 실행 흐름: mcp service registry
- 연관 파일: `mcp.service.ts`
- 목적: 브라우저 자동화 확장
- 장애 추적: 도구 등록/권한 오류 확인

### F27 (#29) 알림 센터
- 상태: 적용
- 트리거: 성공/경고/오류 이벤트
- 실행 흐름: notification service/mixin
- 연관 파일: `notification.service.ts`, `notification.mixin.ts`
- 목적: 사용자 피드백
- 장애 추적: i18n 키/variant 전달값 확인

### F28 (#30) 멀티모달 이미지 입력
- 상태: 적용
- 트리거: 이미지 첨부 + vision/multimodal 모델
- 실행 흐름: image_url part 생성 -> `/api/chat`
- 연관 파일: `chat.store.ts`, `chat-generate.route.ts`
- 목적: 이미지 포함 질의
- 장애 추적: 모델 타입/part 변환 에러 확인

### F29 (#32) 외부 시스템 연동
- 상태: 부분 적용
- 트리거: API/tool integration
- 실행 흐름: tools/services
- 연관 파일: `src/engine/service/**`, `src/engine/langchain/tools/**`
- 목적: 타 시스템 데이터 활용
- 장애 추적: auth/header/timeout 확인

### F30 (#33) 추론 엔진 코어
- 상태: 적용
- 트리거: generate/chat 요청
- 실행 흐름: inference payload build
- 연관 파일: `src/engine/core/inference.ts`
- 목적: 요청 표준화/옵션 반영
- 장애 추적: payload 필드 누락 확인

### F31 (#34) llama 서버 내장
- 상태: 적용
- 트리거: dev:llm / local inference
- 실행 흐름: llama-server 프로세스 + `/llm/*`
- 연관 파일: `src/engine/core/llama-server.ts`
- 목적: 로컬 GGUF 실행
- 장애 추적: model load fail/n_ctx 확인

### F32 (#35) 로그 회전 스트림
- 상태: 적용
- 트리거: logger write
- 실행 흐름: rotating stream
- 연관 파일: `src/engine/core/log-rotating-stream.ts`
- 목적: 로그 파일 관리
- 장애 추적: retention/dir 권한 확인

### F33 (#36) 에이전트 오케스트레이터
- 상태: 적용
- 트리거: agent process 호출
- 실행 흐름: Flow-C
- 연관 파일: `orchestrator.ts`
- 목적: 역할별 실행 분배
- 장애 추적: selectBestAgentByRole 점수 확인

### F34 (#37) 프롬프트 렌더러
- 상태: 적용
- 트리거: template 기반 prompt 생성
- 실행 흐름: PromptStore -> render/interpolate
- 연관 파일: `prompt-renderer.ts`
- 목적: 템플릿 재사용
- 장애 추적: missing variable 경고 확인

### F35 (#38) 에이전트 하니스
- 상태: 적용
- 트리거: orchestrator가 agent run 요청
- 실행 흐름: run -> retry/backoff/jitter
- 연관 파일: `harness.ts`
- 목적: 실행 안정성
- 장애 추적: retry 정책 값/실패 유형 확인

### F36 (#39) 토큰 카운터
- 상태: 적용
- 트리거: chat/generate 전 trim
- 실행 흐름: langchain 우선 -> llama exact -> estimate
- 연관 파일: `token-counter.ts`
- 목적: context overflow 방지
- 장애 추적: tokenModelId/llama URL 확인

### F37 (#40) 응답 캐시
- 상태: 적용
- 트리거: generate 요청
- 실행 흐름: cache hit -> miss -> stale fallback
- 연관 파일: `response-cache.service.ts`, `chat-generate.route.ts`
- 목적: 응답 속도/복원력
- 장애 추적: key 구성/ttl/stale window 확인

### F38 (#41) 메트릭스 서비스
- 상태: 적용
- 트리거: API 이벤트 기록
- 실행 흐름: record -> export/snapshot
- 연관 파일: `metrics.service.ts`
- 목적: 운영 지표 수집
- 장애 추적: endpoint/status 라벨 누락 확인

### F39 (#42) Provider 키 체인
- 상태: 적용
- 트리거: secure-save/rotate-key
- 실행 흐름: keychain 저장 + 회전 메타
- 연관 파일: `provider-keychain.service.ts`, `routes.ts`
- 목적: 키 보안 관리
- 장애 추적: hasApiKey 반영/회전 이력 확인

### F40 (#43) 작업 큐 매니저
- 상태: 적용
- 트리거: 큐 작업 실행
- 실행 흐름: enqueue -> process -> dlq
- 연관 파일: `queue/manager.ts`
- 목적: 안정적 백그라운드 처리
- 장애 추적: deadletter 카운트 확인

### F41 (#44) 서킷 브레이커
- 상태: 적용
- 트리거: 연속 실패 발생
- 실행 흐름: open -> backoff -> half-open
- 연관 파일: `resilience/circuit-breaker.ts`
- 목적: 연쇄 장애 방지
- 장애 추적: retry-after 메시지 확인

### F42 (#45) 로그 관리 모듈(UI)
- 상태: 부분 적용
- 트리거: 로그 페이지 진입
- 실행 흐름: renderer module -> API
- 연관 파일: `src/renderer/module/**`
- 목적: 운영 로그 확인
- 장애 추적: 목록 필터/페이지네이션 확인

### F43 (#46) 미디어/RAG 관리 모듈
- 상태: 부분 적용
- 트리거: 관리 화면 진입
- 실행 흐름: renderer module -> DAL
- 연관 파일: `src/renderer/module/cmh-media/**`
- 목적: 문서/미디어 자산 관리
- 장애 추적: 파일 인덱싱 상태 확인

### F44 (#47) 모델 관리 모듈
- 상태: 적용
- 트리거: 모델 목록/상세 화면
- 실행 흐름: Flow-B
- 연관 파일: `src/renderer/module/cmh-model/**`
- 목적: 모델 선택/상태 관리
- 장애 추적: local/cloud merge 결과 확인

### F45 (#48) Provider 관리 모듈
- 상태: 적용
- 트리거: provider CRUD
- 실행 흐름: renderer -> `/api/providers/*`
- 연관 파일: `src/renderer/module/cmh-provider/**`, `routes.ts`
- 목적: API key/baseUrl 관리
- 장애 추적: secure-save 파싱 오류 확인

### F46 (#49) 설정 관리 모듈
- 상태: 적용
- 트리거: 설정 페이지 저장
- 실행 흐름: user-context update
- 연관 파일: `user-context.store.ts`, `cmh-settings/**`
- 목적: 사용자 기본값 유지
- 장애 추적: 저장 후 재로드 반영 확인

### F47 (#50) 워크플로우 관리 모듈
- 상태: 부분 적용
- 트리거: workflow 화면 CRUD
- 실행 흐름: renderer -> workflow API
- 연관 파일: `src/renderer/module/cmh-workflow/**`
- 목적: 그래프/노드 구성 관리
- 장애 추적: validateWorkflowDef 실패 확인

### F48 (#51) 엔티티 레지스트리
- 상태: 적용
- 트리거: entity register/unregister
- 실행 흐름: registry revision 이벤트
- 연관 파일: `entity-registry.ts`
- 목적: 런타임 엔티티 확장
- 장애 추적: subscribe 처리/cache invalidation 확인

### F49 (#52) Criteria 빌더
- 상태: 적용
- 트리거: 목록 조회
- 실행 흐름: criteria 생성 -> adapter pushdown
- 연관 파일: `criteria.ts`, `criteria-factory.ts`
- 목적: 일관된 검색 조건
- 장애 추적: 지원되지 않는 filter fallback 확인

### F50 (#53) 모델 다운로드 매니저
- 상태: 부분 적용
- 트리거: 모델 다운로드 요청
- 실행 흐름: scripts/manager 경로
- 연관 파일: `scripts/**`, `models/**`
- 목적: 로컬 모델 준비 자동화
- 장애 추적: 파일 무결성/경로 확인

### F51 (#54) API 키 유효성 검사
- 상태: 적용
- 트리거: provider key 사용 전
- 실행 흐름: isUsableApiKey
- 연관 파일: `src/shared/security/is-usable-api-key.ts`
- 목적: placeholder/mock 키 차단
- 장애 추적: 키 문자열 정규화 로직 확인

### F52 (#55) LangChain 콜백 레지스트리
- 상태: 적용
- 트리거: graph 실행 시 callback attach
- 실행 흐름: registry createAutoAttachHandlers
- 연관 파일: `langchain/callbacks/registry.ts`
- 목적: 공통 로깅/추적 훅
- 장애 추적: side-effect import 누락 확인

### F53 (#56) 스트림 이벤트 모니터
- 상태: 적용
- 트리거: stream events 수신
- 실행 흐름: stream bridge -> monitor
- 연관 파일: `stream-event-monitor.ts`, `stream-bridge.ts`
- 목적: 노드/도구 실행 가시화
- 장애 추적: 이벤트 타입 매핑 누락 확인

### F54 (#57) 네트워크 디스커버리
- 상태: 적용
- 트리거: peer discovery 이벤트
- 실행 흐름: routing score 계산
- 연관 파일: `discovery/routing.ts`
- 목적: 최적 경로 선택
- 장애 추적: preferred-route 로그 확인

### F55 (#58) WebSocket 서버
- 상태: 부분 적용
- 트리거: 실시간 통신 요청
- 실행 흐름: server factory 부트 시 attach
- 연관 파일: `src/engine/server/factory.ts`, `ws` 연동부
- 목적: 실시간 양방향 경로
- 장애 추적: 업그레이드/포트 충돌 확인

### F56 (#59) OpenAPI 문서 자동 생성
- 상태: 적용
- 트리거: `/api/openapi.json`, `/api/docs`
- 실행 흐름: openapi route handler
- 연관 파일: `src/engine/server/routes/openapi.ts`
- 목적: API 계약 가시화
- 장애 추적: 스키마 누락/route 등록 확인

### F57 (#60) 웹훅 인증 미들웨어
- 상태: 적용
- 트리거: webhook endpoint 호출
- 실행 흐름: signature verify -> next/reject
- 연관 파일: `server/middleware/webhook-auth.ts`
- 목적: 요청 무결성 보장
- 장애 추적: 서명 헤더/secret mismatch 확인

### F58 (#61) HTTP 트레이스 싱크
- 상태: 적용
- 트리거: tracing callback flush
- 실행 흐름: batch send -> retry
- 연관 파일: `service/http-trace-sink.ts`
- 목적: 외부 추적 백엔드 연동
- 장애 추적: endpoint/auth/timeouts 확인

### F59 (#62) LangGraph 상태 브릿지
- 상태: 적용
- 트리거: graph state update
- 실행 흐름: bridge -> renderer/tool timeline
- 연관 파일: `langchain/graph/stream-bridge.ts`
- 목적: 상태/이벤트 전달 표준화
- 장애 추적: event payload schema 확인

### F60 (#63) 네이버 캡챠 리졸버
- 상태: 초안/부분
- 트리거: 외부 자동화 시 captcha 발생
- 실행 흐름: 웹 에이전트 연계
- 연관 파일: `scripts/*gemini-ocr*`, 외부 연동
- 목적: 자동화 보조
- 장애 추적: OCR 결과 품질/재시도 확인

### F61 (#64) 이메일 모듈
- 상태: 부분 적용
- 트리거: 알림/메시지 발송 요청
- 실행 흐름: service route -> provider
- 연관 파일: `src/engine/server/routes.ts` 내 관련 endpoint
- 목적: 통지 채널 확장
- 장애 추적: SMTP/provider credentials 확인

### F62 (#65~#67 묶음) 사용자 그룹/추적/분산 허브
- 상태: 부분 적용
- 세부 기능: 사용자 그룹 관리(#65), LangSmith 대체 추적(#66), 분산 에이전트 허브(#67)
- 트리거: 관리 화면/운영 모드
- 실행 흐름: DAL + metrics/tracing + discovery
- 연관 파일: `metrics.service.ts`, `discovery/routing.ts`, `entity/*`
- 목적: 운영 규모 확장
- 장애 추적: 권한 매핑/추적 누락/peer 상태 확인

---

## 공통 디버그 체크리스트

- entry log
  - renderer: `chat.store.ts` send 시작/모델/모드
- API request log
  - engine: `chat-generate.route.ts` resolve/trim/provider
- DB write log
  - renderer service: `conversation.service.ts` save/update

실패 시 공통 3단계
1. 입력(모델/키/첨부) 정상 여부 확인
2. API 상태코드/에러메시지 확인
3. DAL 저장 성공 여부 확인
