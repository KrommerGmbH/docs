---
nav:
  title: "카테고리: Chat Experience"
  position: 150

---

# 카테고리: Chat Experience (62개 외 추가)

================================

================================

================================

> 범위: 사용자 체감 UX, 스트림 렌더링, 음성 입출력

---

<a id="chat-send-stream"></a>

## 채팅 전송과 스트림 요청 상세

----------------

----------------

----------------

- 목적: 사용자가 전송한 메시지를 엔진으로 보내고 스트림을 시작
   - 트리거: 채팅 입력창에서 전송
   - 함수 체인: `onSendMessage()` → `sendMessage()` → `streamChat()`
   - 연관 파일: `src/renderer/app/component/structure/cmh-chat-shell/index.ts`, `src/renderer/app/store/chat.store.ts`, `src/renderer/app/service/ai-client.service.ts`

<a id="chat-engine-api"></a>

## 엔진 API 처리 상세

------------

------------

------------

- 목적: `/api/chat`에서 모델/프로바이더를 해석하고 생성 요청 실행
   - 트리거: renderer의 `streamChat()` 호출
   - 함수 체인: `POST /api/chat` → `resolveInferenceTarget()` → `streamText()`
   - 연관 파일: `src/engine/server/routes/chat-generate.route.ts`

<a id="chat-stream-render"></a>

## 스트림 응답 렌더 상세

------------

------------

------------

- 목적: 토큰 delta를 화면에 부드럽게 표시
   - 트리거: 서버 스트림 응답 수신
   - 함수 체인: `parseAIStreamProtocol()` → `chat.store` 반영 → 메시지 카드 렌더
   - 연관 파일: `src/shared/ai-stream/protocol-parser.ts`, `src/renderer/app/store/chat.store.ts`, `src/renderer/app/component/structure/cmh-chat-shell/sub/cmh-chat-message/index.ts`

<a id="stream-parser"></a>

## 스트림 파서 상세

---------

---------

---------

- 목적: 서버 스트림 이벤트를 UI가 바로 사용할 수 있는 공통 포맷으로 정리
   - 핵심 함수: `parseAIStreamProtocol()`
   - 연관 파일: `src/shared/ai-stream/protocol-parser.ts`

<a id="hidden-message-policy"></a>

## CEX-01 Hidden Message Policy

----------------------------

----------------------------

----------------------------

- 목적: 내부 제어 메시지/중간 메시지가 UI에 노출되지 않게 보장
   - 트리거: 스트림 이벤트 타입이 `hidden` 또는 `do-not-render`
   - 프로세스: 스트림 파서가 `hidden: true`를 전달 → 렌더러는 해당 메시지 필터링
   - 연관 파일: `src/shared/ai-stream/protocol-parser.ts`, `src/renderer/app/store/chat.store.ts`
   - 연관 엔티티/라이브러리: AI SDK Data Stream Protocol

<a id="tool-event-timeline"></a>

## CEX-02 Tool Event Timeline 렌더

-----------------------------

-----------------------------

-----------------------------

- 목적: 도구 호출 시작/종료/오류를 대화 내 타임라인으로 시각화
   - 트리거: `tool-start`, `tool-end`, `tool-error` 이벤트 수신
   - 프로세스: protocol-parser 표준화 → chat store `toolEvents` 누적 → 메시지 카드 반영
   - 연관 파일: `src/shared/ai-stream/protocol-parser.ts`, `src/renderer/app/store/chat.store.ts`
   - 연관 엔티티/라이브러리: LangGraph Tool Event

## CEX-03 스트림 렌더 캐시 + 프레임 플러시

--------------------------

--------------------------

--------------------------

- 목적: 초당 다수 delta 수신 시 렌더링 스로틀링으로 UI 떨림 감소
   - 트리거: streaming 메시지 수신 중
   - 프로세스: `_streamRenderCache`에 누적 → `requestAnimationFrame` 단위 flush
   - 연관 파일: `src/renderer/app/store/chat.store.ts`
   - 연관 엔티티/라이브러리: Pinia, requestAnimationFrame

## CEX-04 대화 포크 메타

---------------

---------------

---------------

- 목적: 특정 메시지 시점에서 분기 대화 실험 지원
   - 트리거: 분기 대화 생성
   - 프로세스: `parentId`, `forkFromMessageId`를 대화 메타로 저장
   - 연관 파일: `src/renderer/app/store/chat.store.ts`
   - 연관 엔티티/라이브러리: Conversation meta

## CEX-05 로컬 모델 KeepAlive/Warmup

-----------------------------

-----------------------------

-----------------------------

- 목적: 로컬 GGUF 모델 cold start 지연 최소화
   - 트리거: 선택 모델이 local-gguf이고 idle 상태
   - 프로세스: 주기 점검 → 미로딩 감지 시 warmup API 호출
   - 연관 파일: `src/renderer/app/store/chat.store.ts`, `src/renderer/app/service/ai-client.service.ts`
   - 연관 엔티티/라이브러리: local llama-server

<a id="local-model-load"></a>

## 로컬 모델 로드 상세

-----------

-----------

-----------

- 목적: 로컬 GGUF 모델 목록을 빠르게 보여주기
   - 트리거: 앱 시작, 모델 새로고침
   - 핵심 함수: `loadLocalModelsFromDAL()`
   - 연관 파일: `src/renderer/app/service/llm-model.service.ts`, `src/renderer/app/store/chat.store.ts`

<a id="cloud-model-load"></a>

## 클라우드 모델 로드 상세

-------------

-------------

-------------

- 목적: API 키가 있는 프로바이더의 원격 모델 목록을 UI에 반영
   - 트리거: 앱 시작, 모델 새로고침, 키 변경
   - 핵심 함수: `loadCloudModelsFromDAL()`
   - 연관 파일: `src/renderer/app/service/llm-model.service.ts`, `src/renderer/app/store/chat.store.ts`

<a id="model-selection-apply"></a>

## 선택 모델 적용 상세

-----------

-----------

-----------

- 목적: 현재 상태에서 실제 사용 가능한 모델 하나를 자동 결정
   - 트리거: 모델 목록 갱신 후
   - 핵심 함수: `applyModelSelection()`
   - 연관 파일: `src/renderer/app/store/chat.store.ts`

## CEX-06 Web STT (Whisper)

------------------------

------------------------

------------------------

- 목적: 브라우저에서 음성을 텍스트로 전환
   - 트리거: 녹음 시작/중지
   - 프로세스: MediaRecorder 수집 → 16kHz 변환 → Whisper 추론
   - 연관 파일: `src/renderer/app/service/stt.service.ts`
   - 연관 엔티티/라이브러리: `@huggingface/transformers`, Whisper

## CEX-07 Edge TTS 문장 프리페치

-----------------------

-----------------------

-----------------------

- 목적: TTS 시작 시간을 줄이고 문장 간 끊김 완화
   - 트리거: `speak()` 호출 (engine=`edge-tts`)
   - 프로세스: 문장 분할 → 첫 문장 즉시 재생 → 다음 문장 백그라운드 프리페치
   - 연관 파일: `src/renderer/app/service/tts.service.ts`
   - 연관 엔티티/라이브러리: Edge TTS, Web Audio

## CEX-08 텍스트 기반 언어 자동 감지

----------------------

----------------------

----------------------

- 목적: 입력 언어에 맞는 음성 자동 선택
   - 트리거: TTS 요청 시 `lang` 미지정
   - 프로세스: 문자 패턴 매칭(ko/en/de/zh/ja) 후 voice resolve
   - 연관 파일: `src/renderer/app/service/tts.service.ts`
   - 연관 엔티티/라이브러리: Web Speech API voice selection
