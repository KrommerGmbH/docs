---
nav:
  title: CMH Chatbot Scripts 런타임 Quick Reference
  position: 270

---

# CMH Chatbot Scripts 런타임 Quick Reference

=======================================

=======================================

=======================================

CMH Chatbot의 scripts 폴더 스크립트 중, 실행에 반드시 필요한 것과 선택 항목을 구분합니다.

## 필수 (챗봇 실행 직접 관련)

----------------

----------------

----------------

| 스크립트 | 필요 여부 | 용도 |
| --- | --- | --- |
| `dev-llm.cjs` | 필수 | `llama-server` 실행 |
| `dev-engine.cjs` | 필수 | 엔진 서버 실행 (`dist/cli.js start`) |
| `dev-renderer.cjs` | 필수 | Vite UI 실행 |
| `dev-renderer-wait.cjs` | 필수 | 엔진 준비 대기 후 UI 시작 |
| `dev-cleanup.cjs` | 권장(사실상 필수) | 포트 점유/잔존 프로세스 정리 |
| `dev-ports.cjs` | 필수 | `CMH_*_PORT` 환경변수 + 기본 포트 해석 |
| `ensure-llama-runtime.cjs` | 필수(로컬 LLM 모드) | 플랫폼별 `llama-server` 런타임 탐색/로컬 설치 |
| `doctor.cjs` | 필수(운영 점검) | Node/런타임/모델/포트 환경 진단 |

## 선택 (빌드/운영/보조)

-------------

-------------

-------------

| 스크립트 | 용도 |
| --- | --- |
| `prod-start.cjs` | production 시작 경로 |
| `download-onnx-models.mjs` | ONNX STT 모델 다운로드 보조 |
| `fix-meteor-sourcemaps.cjs` | postinstall 보정 |
| `web-test-deploy.ps1` | 웹 테스트 배포 보조 |
| `migrate-aideworks.ps1`, `fix-remaining-aw-refs.ps1` | 마이그레이션/정비 보조 |

## 결론

--

--

--

- **챗봇 실행 자체에는 scripts 폴더가 필요합니다.**
   - 특히 `dev:chat` 경로는 위 "필수" 항목을 직접 호출하므로, scripts 누락 시 실행이 실패합니다.
   - 운영 서버에서는 최소한 `dev-*`, `ensure-llama-runtime.cjs`, `doctor.cjs`를 유지하세요.
