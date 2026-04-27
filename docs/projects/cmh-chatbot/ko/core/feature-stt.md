---
nav:
  title: STT (Speech-to-Text) 기능
  position: 215

---

# STT (Speech-to-Text) 기능

=======================

==================================

> 버전: 1.0
> 상태: 적용
> 범위: renderer → engine

---

## 개요

--

브라우저에서 음성을 텍스트로 실시간 변환하는 기능입니다. Web Speech API를 기반으로 동작하며, 사용자의 음성 입력을 자동으로 텍스트로 변환하여 채팅 입력창에 삽입합니다.

---

## 주요 기능

-----

- **실시간 음성 인식**: 사용자가 말하는 즉시 텍스트로 변환
   - **다국어 지원**: 자동 언어 감지 (`detectLanguage()`)
   - **Whisper 모델**: 로컬/클라우드 Whisper 모델 사용 가능
   - **진행 상태 표시**: 인식 중/정지/에러 상태 UI 피드백
   - **일시정지/재개**: 사용자 제어 가능

---

## 실행 흐름

-----

### Flow: 음성 인식 → 텍스트 변환

--------------------

```text
Renderer (마이크 버튼) → MediaRecorder 시작 → 음성 청취
    ↓
Web Speech API (SpeechRecognition) → 음성 → 텍스트 변환
    ↓
onSttResult 콜백 → AttachedFile 생성 (audio dataUrl)
    ↓
AttachmentService → Whisper 모델 호출 (또는 Web Speech API 결과 직접 사용)
    ↓
텍스트 추출 → 채팅 입력창에 삽입 → 사용자 확인 후 전송
```text
---

## 연관 파일

-----

| 파일 | 역할 |
|------|------|
| `src/renderer/app/service/stt.service.ts` | STT 핵심 서비스 (Web Speech API 래퍼) |
| `src/renderer/app/component/structure/cmh-chat-shell/sub/cmh-chat-input/index.ts` | 마이크 버튼 UI 및 이벤트 처리 |
| `src/engine/attachment/attachment.service.ts` | 오디오 파일 처리 (Whisper 모델 연동) |
| `src/engine/attachment/strategies/web-upload.strategy.ts` | 웹 업로드 전략 (오디오) |

---

## 상태 관리

-----

```typescript
// STT 서비스 상태
getIsRecording(): boolean      // 녹음 중 여부
getIsModelLoaded(): boolean    // Whisper 모델 로드 여부
```text
---

## 이벤트 콜백

------

```typescript
onSttStatus(cb: SttStatusCallback)      // 상태 변경 콜백
onSttResult(cb: SttResultCallback)      // 결과 수신 콜백
onSttProgress(cb: SttProgressCallback)  // 진행률 콜백
```text
---

## 사용 시나리오

-------

1. **사용자가 마이크 버튼 클릭**
   - `startRecording()` 호출
   - MediaRecorder 시작 → 음성 캡처

2. **음성 인식 결과 수신**
   - Web Speech API → `onSttResult` 콜백
   - 텍스트를 `AttachedFile`로 변환 (audio/dataUrl)

3. **Whisper 모델 사용 (선택)**
   - `AttachmentService`에서 Whisper API 호출
   - 더 정확한 음성 인식 (오프라인/클라우드)

4. **채팅 입력창에 텍스트 삽입**
   - 사용자가 확인 후 수정 가능
   - 전송 시 일반 메시지와 동일 처리

---

## 디버깅 가이드

-------

### "STT가 작동하지 않음"

--------------

1. 브라우저 음성 인식 권한 확인 (microphone permission)
2. `getIsRecording()` 상태 확인
3. `onSttStatus` 콜백 로그 확인
4. Web Speech API 지원 브라우저인지 확인 (Chrome 권장)

### "Whisper 모델이 응답하지 않음"

---------------------

1. `getIsModelLoaded()` → `false`면 모델 로드 필요
2. `llama-server` 실행 상태 확인
3. `/api/local-models`에서 whisper 모델 확인

---

## 관련 기능

-----

- **TTS (Text-to-Speech)**: F?? - 텍스트 음성 출력
   - **파일 첨부 시스템**: F21 - 오디오 파일 업로드
   - **RAG 문서 파이프라인**: F03 - 오디오에서 텍스트 추출 후 RAG

---

## Related Docs

------------

- [TTS (Text-to-Speech) 기능](./feature-tts.md)
   - [파일 첨부 시스템](../F21-attachment-system.md)
   - [RAG 문서 파이프라인](../F03-rag-pipeline.md)
