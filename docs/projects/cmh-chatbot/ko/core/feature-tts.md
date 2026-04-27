---
nav:
  title: TTS (Text-to-Speech) 기능
  position: 216

---

# TTS (Text-to-Speech) 기능

=======================

==================================

> 버전: 1.0
> 상태: 적용
> 범위: renderer → engine

---

## 개요

--

텍스트를 음성으로 변환하는 기능입니다. Edge TTS 엔진을 기본으로 지원하며, 스트리밍 TTS, 자동 읽기, 다양한 음성 옵션을 제공합니다.

---

## 주요 기능

-----

- **Edge TTS**: Microsoft Edge 브라우저 내장 TTS 엔진
   - **스트리밍 TTS**: 토큰 단위로 점진적 음성 생성 (LLM 스트리밍과 연동)
   - **자동 읽기 (Auto-Read)**: AI 응답 자동 음성 출력
   - **다중 음성**: 언어/성별/속도 조정 가능
   - **언어 자동 감지**: `detectLanguage()`로 텍스트 언어 감지 후 적절한 음성 선택

---

## 실행 흐름

-----

### Flow: 텍스트 → 음성 스트리밍

-------------------

```text
사용자/응답 텍스트 → TTS 서비스 startStreamingSpeak()
    ↓
Edge TTS 엔진 초기화 (configureEdgeTts)
    ↓
텍스트 청크 단위로 음성 생성 (스트리밍)
    ↓
AudioElement 재생 → 사용자에게 출력
    ↓
일시정지/재개/중지 제어 가능
```text
---

## 연관 파일

-----

| 파일 | 역할 |
|------|------|
| `src/renderer/app/service/tts.service.ts` | TTS 핵심 서비스 (Edge TTS 래퍼) |
| `src/renderer/app/component/structure/cmh-chat-shell/sub/cmh-chat-message/index.ts` | 응답 메시지 렌더링 + TTS 연동 |
| `vite-plugin-edge-tts.ts` | Edge TTS Vite 플러그인 |

---

## TTS 엔진 종류

---------

```typescript
enum TtsEngine {
  EDGE = 'edge',     // Microsoft Edge TTS (기본)
  // 향후: LOCAL, OPENAI, GOOGLE 등 확장 가능
}
```text
---

## 설정 옵션

-----

```typescript
interface TtsOptions {
  rate?: number;        // 음성 속도 (0.1 ~ 10, 기본 1.0)
  pitch?: number;       // 음성 피치 (0.5 ~ 2.0)
  volume?: number;      // 음량 (0 ~ 1)
  voice?: string;       // 음성 이름 (예: "ko-KR-JiMinNeural")
}
```text
---

## 주요 API

------

```typescript
// 설정
configureEdgeTts(config: TtsModelConfig): void
setActiveEngine(engine: TtsEngine): void
setTtsOptions(opts: Partial<TtsOptions>): void

// 상태
getActiveEngine(): TtsEngine
getTtsOptions(): TtsOptions
getEdgeTtsConfig(): TtsModelConfig | null
isSpeaking(): boolean

// 제어
startStreamingSpeak(opts?: TtsOptions): StreamingTtsHandle
stop(): void
pause(): void
resume(): void

// 자동 읽기
setAutoRead(enabled: boolean): void
getAutoRead(): boolean
```text
---

## 스트리밍 TTS 핸들

-----------

```typescript
interface StreamingTtsHandle {
  /** LLM에서 도착한 토큰(delta) 전달 */
  pushToken(token: string): void;

  /** 스트리밍 완료 */
  finish(): Promise<void>;

  /** 에러 발생 시 취소 */
  error(err: Error): void;
}
```text
**사용법:**
```typescript
const handle = startStreamingSpeak();
stream.onToken((token) => handle.pushToken(token));
stream.onFinish(() => handle.finish());
```text
---

## 디버깅 가이드

-------

### "TTS가 출력되지 않음"

--------------

1. `isSpeaking()` 확인
2. 브라우저 음성 출력 권한 확인
3. `getActiveEngine()`이 유효한지 확인
4. `getEdgeTtsConfig()`가 설정되었는지 확인

### "음성이 끊김/느림"

-----------

1. `TtsOptions.rate` 조정 (기본 1.0)
2. 스트리밍 버퍼 크기 확인
3. 네트워크 지연 (Edge TTS는 온라인 필요)

### "한국어 음성이 없음"

------------

1. `detectLanguage()`로 언어 감지 확인
2. Edge TTS에서 지원하는 한국어 음성 목록 확인
3. `setTtsOptions({ voice: 'ko-KR-JiMinNeural' })`로 수동 지정

---

## 관련 기능

-----

- **STT (Speech-to-Text)**: F?? - 음성 입력
   - **자동 읽기 정책**: `chat-title-policy.ts`와 연동
   - **Edge TTS 플러그인**: `vite-plugin-edge-tts.ts`

---

## Related Docs

------------

- [STT (Speech-to-Text) 기능](./feature-stt.md)
   - [자동 읽기 정책](../F10-auto-read-policy.md)
