# CMH Web Agent Developer Guide Quickstart

원본: `cmh-web-agent/docs/developer-guide.md`

## 초급자 이해 포인트

1. Trigger(스케줄/AI/MCP) → API 진입
2. Browser/Engine/Markdown/Entity 계층 분리
3. Proxy + Stealth + Session 유지가 핵심

## 주요 디렉토리

- `src/api`: crawl/extract/mcp 엔트리
- `src/browser`: 브라우저 인스턴스/스텔스
- `src/engine`: 액션 실행 엔진
- `src/entity`: 추출 결과 매핑/검증
