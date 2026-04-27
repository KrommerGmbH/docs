---
nav:
  title: Model Warmup Registry 기능
  position: 217

---

# Model Warmup Registry 기능

========================

==================================

> 버전: 1.0
> 상태: 부분 적용
> 범위: renderer → engine

---

## 개요

--

로컬 GGUF 모델의 cold start 지연을 줄이기 위해, 사전 로딩(warmup) 상태를 관리하는 기능입니다. 자주 사용하는 모델을 미리 로드해두어 첫 요청 시 지연을 최소화합니다.

---

## 주요 기능

-----

- **모델 warmup 상태 추적**: 각 모델의 로드 완료 여부 관리
   - **자동 warmup**: 모델 선택 시 백그라운드 로드
   - **수동 warmup**: 관리자가 미리 로드
   - **메모리 관리**: 불필요한 모델 언로드 (향후)

---

## 실행 흐름

-----

```text
모델 선택 → ModelWarmupRegistry.isWarmed(modelId) 확인
    ↓
false → 백그라운드에서 모델 로드 시작 (llama-server)
    ↓
true → 즉시 추론 가능
    ↓
첫 요청 시 warmup 완료 대기 또는 바로 실행
```text
---

## 연관 파일

-----

| 파일 | 역할 |
|------|------|
| `src/renderer/app/service/model-warmup-registry.ts` | Warmup 레지스트리 싱글톤 |
| `src/engine/core/llama-server.ts` | 로컬 llama-server 프로세스 관리 |
| `src/engine/provider/model-factory.ts` | 모델 resolve + warmup 트리거 |

---

## 사용 API

------

```typescript
const registry = createModelWarmupRegistry();

// 상태 확인
registry.isWarmed(modelId: string): boolean

// warmup 트리거 (내부에서 자동 호출)
// - ModelFactory가 모델 resolve 시 자동 warmup 시작
```text
---

## 디버깅 가이드

-------

### "첫 요청이 느림"

----------

1. `registry.isWarmed(modelId)` → `false`인지 확인
2. `llama-server` 로그에서 모델 로드 진행 상황 확인
3. `/api/local-models`에서 모델 상태 확인

### "메모리 부족"

--------

1. warmup된 모델 수 제한 필요
2. 사용 빈도가 낮은 모델은 언로드 정책 도입

---

## 관련 기능

-----

- **로컬 모델 지원**: F18 - GGUF 모델 실행
   - **모델 관리 모듈**: F44 - 모델 목록/상세 관리
   - **토큰 카운터**: F36 - 모델 context 관리

---

## Related Docs

------------

- [로컬 모델 지원](../F18-local-models.md)
   - [모델 관리 모듈](../F44-model-management.md)
