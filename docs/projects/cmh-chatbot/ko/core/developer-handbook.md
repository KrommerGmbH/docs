---
nav:
  title: CMH Chatbot 개발자 핸드북
  position: 125

---

# CMH Chatbot 개발자 핸드북 (현재 구현 기준)

==============================

==============================

==============================

> 목적: 온보딩, 디버깅, 빠른 수정
> 원칙: 이 문서는 "현재 코드가 실제로 어떻게 실행되는지"만 기록

---

## STEP 1) Core Features (행동 기준)

-----------------------------

-----------------------------

-----------------------------

1. 채팅 전송/스트리밍 응답
   - Trigger: 채팅 입력 전송
   - Purpose: 사용자 메시지를 모델에 전달하고 스트리밍 응답 표시

2. 모델/Provider 선택과 fallback
   - Trigger: 모델 선택, API 키 상태 변화
   - Purpose: 사용 가능한 모델로 안정적으로 라우팅

3. 첨부파일 처리(RAG 전단 포함)
   - Trigger: 파일 첨부 후 전송
   - Purpose: 텍스트/이미지/PDF를 모델 입력 가능 형태로 변환

4. 에이전트/워크플로우 실행
   - Trigger: 에이전트 선택, LangGraph 경로 실행
   - Purpose: supervisor/manager/worker 분기 처리

5. 데이터 영속화(DAL)
   - Trigger: 대화 생성/수정/삭제, 설정 저장
   - Purpose: 대화/엔티티/설정 안정 저장

6. 관측/복원력
   - Trigger: API 호출, 캐시, 큐, 회로차단
   - Purpose: 실패시 복구, 운영 가시성 확보

---

## STEP 2) Execution Flow (실행 경로)

------------------------------

------------------------------

------------------------------

### 2-A. 채팅 전송 (가장 중요)

------------------

------------------

------------------

1. Trigger
   - renderer에서 전송 버튼 클릭

2. Flow
   - `src/renderer/app/component/structure/cmh-chat-shell/sub/cmh-chat-input/index.ts` → emit `send`
   - `src/renderer/app/component/structure/cmh-chat-shell/index.ts` → `onSendMessage()`
   - `src/renderer/app/store/chat.store.ts` → `sendMessage()`
   - `src/renderer/app/service/ai-client.service.ts` → `streamChat()`
   - `src/engine/server/routes/chat-generate.route.ts` → `POST /api/chat`
   - 동일 파일 내부: `resolveInferenceTarget()` → trim/token 계산 → `streamText()`
   - renderer 복귀: delta 수신 → `_streamRenderCache` 집계/flush
   - `src/renderer/app/service/conversation.service.ts` → persist

3. Output
   - assistant 메시지 스트리밍 렌더 + 대화 저장

### 2-B. Prompt/Memory/Tool 경로 (AI CHATBOT 확장 요구)

---------------------------------------------

---------------------------------------------

---------------------------------------------

1. Trigger
   - 사용자 메시지 전송

2. Flow
   - UI: `chat.store.sendMessage()`
   - memory.load: 기존 대화 히스토리 + DAL 로드 (`conversation.service.ts`)
   - promptBuilder: `systemPrompt` 조합 + attachment text block + thinking/ocr/fast 모드 보정
   - LLM call: engine `POST /api/chat` → `streamText()`
   - tool execution: LangChain tool 레이어 (`src/engine/langchain/tools/**`) + stream event bridge
   - memory.save: 메시지/평가/메타 저장 (`conversation.service.ts`, DAL)

3. Output
   - 최종 응답(스트림) + 도구 이벤트 + 저장 완료 상태

### 2-C. Electron/IPC 경로 (ELECTRON 확장 요구)

-------------------------------------

-------------------------------------

-------------------------------------

1. Trigger
   - 호스트 Electron 앱에서 renderer 이벤트 발생

2. Flow (현재 저장소 현실)
   - renderer: 채팅 이벤트 발생
   - IPC send: **현재 저장소에는 실채널 구현 없음**
   - main: `src/main/ipc/router.d.ts` (타입 선언)
   - 실제 로직 실행: HTTP 엔진 경로 (`/api/chat`, `/api/generate`)에서 처리

3. Output
   - renderer UI 업데이트 (HTTP 응답/스트림 기반)

---

## STEP X) IPC Map

---------------

---------------

---------------

- channel name: 현재 리포 기준 명시적 구현 없음
   - sender: renderer (호스트 앱 구현 시)
   - receiver: main process (호스트 앱 구현 시)
   - 실제 핵심 로직 위치: engine HTTP routes

---

## STEP X) Prompt Structure

------------------------

------------------------

------------------------

- System prompt
  - `chat.store.ts`의 `_getSystemPrompt()`
  - `chat-generate.route.ts`의 기본 system fallback
   - User input
  - textarea + 첨부(텍스트/이미지) 병합
   - Context
  - `trimHistoryWithCounter()`에서 contextLength 기준 trim
   - Tool definitions
  - `src/engine/langchain/tools/**`
   - Memory
  - Checkpointer: `src/engine/langchain/memory/checkpointer.ts`
  - Conversation DAL: `src/renderer/app/service/conversation.service.ts`

---

## STEP 3) Dependency Map

----------------------

----------------------

----------------------

- 재사용 모듈
  - `chat.store.ts` (UI 오케스트레이션 중심)
  - `chat-generate.route.ts` (`/api/chat` `/api/generate` 공통)
  - `token-counter.ts` (trim/예산 공통)
  - `criteria-factory.ts` (DAL 검색 공통)

   - 공유 서비스
  - notification service/mixin
  - response cache service
  - scheduler service
  - provider keychain service

   - 숨은 결합(주의)
  - 모델 선택 로직 ↔ user-context 저장값
  - cloud provider key 상태 ↔ 모델 렌더링/선택 가능 여부
  - stream delta 캐시 ↔ UI 빈응답 판정 타이밍

---

## STEP 4) Data Flow

-----------------

-----------------

-----------------

### 채팅

--

--

--

- Input: 사용자 텍스트 + 첨부 + 모델 선택 + thinking
   - Transform:
  - 첨부 텍스트 블록 생성
  - 히스토리 trim/token budget
  - provider/model resolve/fallback
   - Output: 스트리밍 메시지, 모델명, tool 이벤트, 저장 레코드
   - External API:
  - local llama-server (`/llm/v1/chat/completions`)
  - cloud providers (OpenAI/Anthropic/Google/GitHub)

### 모델 목록

-----

-----

-----

- Input: local models dir + provider DAL
   - Transform: local scan/watch + cloud remote-models fetch + merge
   - Output: provider group 모델 목록
   - External API: Google/GitHub provider catalog endpoints

---

## STEP 5) Bug Tracking Guide

--------------------------

--------------------------

--------------------------

### "전송했는데 응답이 없음"

--------------

--------------

--------------

1. renderer entry log 확인
   - `chat.store.sendMessage()` 시작 로그 `[chat:xxxx] ▶ START`
2. API request 확인
   - `/api/chat` body, modelId, provider resolve
3. timeout/abort 확인
   - first token timeout / overall timeout 경고
4. DB write 확인
   - conversation/message persist 성공 여부

### "클라우드 모델이 안 뜸"

--------------

--------------

--------------

- provider `hasApiKey` 확인
   - `/api/providers/:id/remote-models` 상태코드 확인
   - no-key fallback notice 렌더링 확인

### "응답 품질이 갑자기 나빠짐"

----------------

----------------

----------------

- `systemPrompt` 누락/변형 확인
   - `trimHistoryWithCounter` 과도 trim 여부 확인
   - fallback provider로 바뀌었는지 확인

권장 로그 위치

- entry log: `chat.store.ts` 전송 시작/모드/모델
   - API request log: `chat-generate.route.ts` resolve 단계
   - DB write log: conversation save/update/persist 경로

---

## STEP 6) File Map (주니어용)

-----------------------

-----------------------

-----------------------

- 채팅 UI 수정
  - `src/renderer/app/component/structure/cmh-chat-shell/**`
   - 전송/모델/첨부 정책 수정
  - `src/renderer/app/store/chat.store.ts`
   - API 에러/응답 포맷 수정
  - `src/engine/server/routes/chat-generate.route.ts`
   - 모델 탐색/remote-models 수정
  - `src/engine/server/routes.ts`
   - 에이전트 분기/재시도 수정
  - `src/engine/agent/orchestrator.ts`
  - `src/engine/agent/harness.ts`
   - RAG/문서 처리 수정
  - `src/engine/langchain/rag/document-pipeline.ts`
  - `src/engine/langchain/rag/vector-store.adapter.ts`

---

## STEP 7) Anti-Patterns & Problems

--------------------------------

--------------------------------

--------------------------------

- 중복/리스크
  - 모델 관련 정책이 renderer/store + engine/routes 양쪽에 분산
  - no-key/disabled UI 정책이 provider별 조건과 강결합
  - 대규모 플랜 문서와 구현 진척 체크의 동기화 비용 큼

   - 개선 권장
  - 모델 선택/가용성 규칙을 단일 정책 모듈화
  - 디버그 로그 키를 request-id 기준으로 통일
  - 수동 검증 항목은 E2E/API 스크립트로 계속 자동화
