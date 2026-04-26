# AGENTS.md

이 문서는 `cmh-docs` 저장소에서 작업하는 에이전트용 운영 규칙이다.

## 1. 범위

- 이 저장소는 문서 콘텐츠와 VitePress 설정을 관리한다.
- Public 문서만 다룬다. Private 문서는 별도 저장소(`docs-internal`)에서만 관리한다.

## 2. 문서 구조 원칙

- 기본 IA: `products/`, `concepts/`, `guides/`, `references/`, `projects/`
- 프로젝트 문서는 프로젝트 허브에서 시작한다.
- `cmh-chatbot`는 현재 `ko` 트랙만 운영한다.

## 3. 링크/이동 규칙

- 문서 이동/이름 변경 시 `.gitbook.yaml`의 `redirects`에 반드시 매핑을 추가한다.
- 상대 링크는 실제 존재 경로로만 작성한다.
- 링크 변경 후 `docs:build`로 무결성을 확인한다.

## 4. 마크다운 스타일

- 스타일 규칙은 `markdown-style-config.yml`을 따른다.
- 최소 요구: heading 계층, 공백/개행, fenced code language, 링크 유효성.

## 5. 작업 체크리스트

- [ ] 변경 범위가 단일 목적에 집중되어 있는가
- [ ] 문서 구조(Overview~Checklist)가 필요한 곳에 반영되었는가
- [ ] 민감정보(토큰/계정/내부 URL)가 없는가
- [ ] 리다이렉트 추가가 필요한 이동/개명 변경이 없는가
- [ ] `pnpm docs:build`가 성공하는가

## 6. 금지 사항

- Public 문서에 Private 정보 노출 금지
- 이동된 문서의 redirect 누락 금지
- 서로 무관한 대규모 구조 변경을 한 번에 수행 금지
