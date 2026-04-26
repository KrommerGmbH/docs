# Public Docs 온보딩 (초급자용)

이 문서는 `docs.my-mik.de` 공개 문서를 어떻게 읽고, 어떻게 업데이트하는지 안내합니다.

## 1. Public 문서의 목적

- 외부 공개 가능한 개발 문서만 제공
- 빠른 진입: 프로젝트 → 기능 그룹 → 구현 가이드
- 운영 문서도 공개 가능한 범위만 포함

## 2. 문서 읽는 순서

1. [문서 홈](./index.md)
2. [Projects](./projects/index.md)
3. [CMH Chatbot 인덱스](./projects/cmh-chatbot/index.md)
4. [기능 그룹 인덱스](./README.md)
5. [가이드/참조](./guides/index.md), [references/index.md](./references/index.md)

## 3. 작성 규칙

- 초급자 기준으로 목적/트리거/입력/출력부터 설명
- 코드 링크는 가능한 실제 파일 기준으로 작성
- 다이어그램은 단순 흐름(Trigger → Service → Result)
- 비공개 정보(내부 URL/토큰/운영 계정)는 절대 포함 금지

## 4. 배포 체크

- 대상 저장소: `KrommerGmbH/docs`
- 워크플로: `.github/workflows/docs-deploy-subdomain.yml`
- 필수 시크릿: `DOCS_DEPLOY_HOST`, `DOCS_DEPLOY_USER`, `DOCS_DEPLOY_PATH`, `DOCS_DEPLOY_SSH_KEY_B64`

## 5. 자주 하는 실수

- Public/Private 문서 섞어서 커밋
- `DOCS_DEPLOY_PATH`와 Plesk Document Root 불일치
- dead link 방치
