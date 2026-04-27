---
nav:
  title: "카테고리: Workflow & Admin Tools"
  position: 170

---

# 카테고리: Workflow & Admin Tools (62개 외 추가)

=======================================

=======================================

=======================================

> 범위: 워크플로우 편집/관찰, 운영자 도구, API 문서성

---

## WFA-01 워크플로우 실행 모니터링 패널

-----------------------

-----------------------

-----------------------

- 목적: 실행 중 노드 상태를 실시간 진단
   - 트리거: 워크플로우 상세 화면에서 모니터링 토글
   - 프로세스: `nodeMetrics`, `toolCallHistory`, `executionSnapshots` 업데이트/렌더
   - 연관 파일: `src/renderer/module/cmh-workflow/page/cmh-workflow-detail/index.ts`
   - 연관 엔티티/라이브러리: Vue Flow

## WFA-02 워크플로우 스냅샷 Time-Travel

----------------------------

----------------------------

----------------------------

- 목적: 과거 실행 스냅샷 기준으로 노드 상태를 재현해 원인 분석
   - 트리거: 스냅샷 목록에서 항목 선택
   - 프로세스: `selectSnapshot(index)` → 각 노드 상태를 store에 재적용
   - 연관 파일: `src/renderer/module/cmh-workflow/page/cmh-workflow-detail/index.ts`, `src/renderer/app/store/workflow.store.ts`
   - 연관 엔티티/라이브러리: ExecutionSnapshot

## WFA-03 OpenAPI 문서 자동 생성

-----------------------

-----------------------

-----------------------

- 목적: 엔진 API 스펙을 기계/사람 모두 접근 가능하게 제공
   - 트리거: `/api/openapi.json` 또는 `/api/docs` 접근
   - 프로세스: 서버가 OpenAPI JSON 생성 → Swagger UI HTML로 렌더
   - 연관 파일: `src/engine/server/routes.ts`, `src/engine/server/routes/openapi.ts`
   - 연관 엔티티/라이브러리: OpenAPI, Swagger UI

## WFA-04 설정 화면 음성/생성 파라미터 동기화

---------------------------

---------------------------

---------------------------

- 목적: 운영자가 변경한 TTS/STT/채팅 파라미터를 사용자 컨텍스트에 즉시 반영
   - 트리거: settings detail 입력 변경
   - 프로세스: `useUserContextStore().updateSettings()`로 단일 저장소 업데이트
   - 연관 파일: `src/renderer/module/cmh-settings/page/cmh-settings-detail/index.ts`, `src/renderer/app/store/user-context.store.ts`
   - 연관 엔티티/라이브러리: Pinia store sync
