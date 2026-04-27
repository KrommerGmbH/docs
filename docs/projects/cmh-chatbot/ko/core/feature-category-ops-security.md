---
nav:
  title: 카테고리: Ops / Security / Reliability
  position: 180

---

# 카테고리: Ops / Security / Reliability (62개 외 추가)

=============================================

=============================================

=============================================

> 범위: 운영 안정성, 보안 게이트, 라우팅 복원력

---

## OPS-01 API 고정 윈도우 Rate Limiting

-------------------------------

-------------------------------

-------------------------------

- 목적: 과도한 요청으로 인한 서비스 과부하 방지
   - 트리거: `/api/chat`, `/api/generate` 요청
   - 프로세스: 클라이언트 키 산출(IP 헤더) → 윈도우 카운트 제한 초과 시 429
   - 연관 파일: `src/engine/server/routes.ts`
   - 연관 엔티티/라이브러리: Hono middleware

## OPS-02 Prometheus + JSON 메트릭 이중 포맷

----------------------------------

----------------------------------

----------------------------------

- 목적: 모니터링 시스템과 운영 대시보드 동시 지원
   - 트리거: `/api/metrics`, `/api/metrics/summary`
   - 프로세스: 카운터/히스토그램/event 기록 → 텍스트/JSON로 export
   - 연관 파일: `src/engine/service/metrics.service.ts`, `src/engine/server/routes.ts`
   - 연관 엔티티/라이브러리: Prometheus exposition format

## OPS-03 Queue Dead-Letter Queue 분리

---------------------------------

---------------------------------

---------------------------------

- 목적: 최종 실패 작업을 본 큐와 분리해 운영 진단성 강화
   - 트리거: BullMQ job 최종 실패
   - 프로세스: 실패 이벤트 감지 → DLQ enqueue → diagnostics 노출
   - 연관 파일: `src/engine/queue/manager.ts`
   - 연관 엔티티/라이브러리: BullMQ

## OPS-04 Security Gate 이상탐지 휴리스틱

------------------------------

------------------------------

------------------------------

- 목적: 위험 액션을 조기 탐지하고 감사 추적 강화
   - 트리거: agent action validate
   - 프로세스: burst-rate/sensitive-keyword/denied-streak 검사 + 경고 로그
   - 연관 파일: `src/engine/agent/security-gate.ts`
   - 연관 엔티티/라이브러리: security callbacks, audit log

## OPS-05 Webhook HMAC 인증

----------------------

----------------------

----------------------

- 목적: 외부 webhook 위변조 방지
   - 트리거: webhook 엔드포인트 요청 수신
   - 프로세스: `X-Webhook-Signature` 파싱 → HMAC 비교(`timingSafeEqual`) → 실패 시 401
   - 연관 파일: `src/engine/server/middleware/webhook-auth.ts`
   - 연관 엔티티/라이브러리: Node crypto HMAC

## OPS-06 Discovery 우선 경로 점수화

--------------------------

--------------------------

--------------------------

- 목적: mDNS/Tailscale 복수 후보 중 권장 연결 경로 자동 선택
   - 트리거: discovery 후보 갱신 시
   - 프로세스: source/latency/private-ip/loopback 가중치 계산 → best route 반환
   - 연관 파일: `src/engine/discovery/routing.ts`
   - 연관 엔티티/라이브러리: discovery route scoring
