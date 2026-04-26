# Plugin Authoring Quickstart

원본: `aideworks/docs/plugin-authoring-guide.md`

## 플러그인 시작 순서

1. `aw-plugin-{name}` 디렉토리 생성
2. `package.json`, `index.ts` 작성
3. module/page 컴포넌트 등록
4. i18n snippet 등록
5. settings/menu 연결

## 최소 구조

- `index.ts` (진입점)
- `module/index.ts` (라우트/메뉴)
- `page/*` (`index.ts`, `.html`, `.scss`)
- `snippet/ko-KR.json`, `en-GB.json`

## 주의

- 사용자 노출 텍스트 하드코딩 금지
- 아이콘은 프로젝트 규칙 소스만 사용
