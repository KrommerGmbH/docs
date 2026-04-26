# AideWorks Patterns Quickstart

원본: `aideworks/docs/aideworks-patterns.md`

## 초급자 체크리스트

1. 파일 구조: `app/`, `module/`, `core/`, `main/` 분리
2. 모듈 기본: list + detail 페이지 쌍
3. i18n: 하드코딩 금지, snippet 5개 로케일 동시 관리
4. 색상/토큰: CSS Custom Property 사용
5. Entity ID: UUID 사용

## 핵심 패턴

- Main/Renderer 분리
- Repository + Criteria 패턴
- ModuleFactory/SettingsFactory 등록
- 3-file 컴포넌트 패턴(`index.ts`, `.html`, `.scss`)
