# 카테고리: AI Runtime & Orchestration (62개 외 추가)

> 범위: 에이전트 실행 엔진, 그래프 스트리밍, 캐시 복원력

---

## AIR-01 역할 기반 동적 부하 분산
- 목적: 동일 역할 에이전트가 여러 개일 때 안정적으로 최적 실행 대상 선택
- 트리거: `process()`/`runAgent()` 호출
- 프로세스: runtime 통계(`inFlight`, `failureRate`, `lastRunAt`) 점수 계산 후 선택
- 연관 파일: `src/engine/agent/orchestrator.ts`
- 연관 엔티티/라이브러리: AgentHarness, LangChain Chat Model

## AIR-02 실행 통계 자동 축적
- 목적: 성공/실패/지연시간 기반 운영 최적화
- 트리거: `runWithStats()` 래핑 실행
- 프로세스: 실행 전후 카운트/latency 갱신 → 다음 선택 점수에 반영
- 연관 파일: `src/engine/agent/orchestrator.ts`
- 연관 엔티티/라이브러리: runtime map

## AIR-03 LangGraph 토큰 스트리밍 브리지
- 목적: 그래프 업데이트를 토큰/상태 이벤트로 외부 UI에 전달
- 트리거: `streamWithGraph()` 호출
- 프로세스: graph `stream(updates)` 소비 → 메시지 추출 → token 이벤트 yield
- 연관 파일: `src/engine/agent/orchestrator.ts`
- 연관 엔티티/라이브러리: LangGraph, CallbackHandlerRegistry

## AIR-04 체크포인터 Lazy Init
- 목적: 그래프 미사용 시 초기 부하를 줄이고, 사용 시 즉시 상태 저장 경로 확보
- 트리거: `processWithGraph()`/`streamWithGraph()` 첫 호출
- 프로세스: 최초 호출에서 `createCheckpointer({ type: 'memory' })`로 초기화
- 연관 파일: `src/engine/agent/orchestrator.ts`
- 연관 엔티티/라이브러리: LangGraph checkpointer

## AIR-05 Adaptive TTL + Stale Window 캐시
- 목적: 응답 캐시 hit율 개선 + 업스트림 장애 시 복원력 확보
- 트리거: 캐시 조회/저장 시
- 프로세스: adaptive TTL 계산 → 만료 후 stale window 내 stale-hit 허용
- 연관 파일: `src/engine/service/response-cache.service.ts`
- 연관 엔티티/라이브러리: SHA-256 keying, in-memory LRU
