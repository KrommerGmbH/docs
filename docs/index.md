# CMH Developer Docs

표준 문서 포털 운영 방식으로 **GitHub 문서 → VitePress 빌드 → 서브도메인 배포**를 목표로 만든 개발자 문서 포털입니다.

## 문서 구조 (표준 구조)

- [Products](./products/index.md): 프로젝트별 문서 허브
- [Concepts](./concepts/index.md): 아키텍처/동작 원리
- [Guides](./guides/index.md): 따라하기 중심 가이드
- [References](./references/index.md): 카탈로그/운영 참조

## 빠른 링크

- [CMH Chatbot 문서 인덱스](./projects/cmh-chatbot/ko/core/README.md)
- [Developer Handbook](./projects/cmh-chatbot/ko/core/developer-handbook.md)
- [Feature Catalog 62](./projects/cmh-chatbot/ko/core/feature-catalog-62.md)
- [Feature Discovery Worklog](./projects/cmh-chatbot/ko/core/feature-discovery-worklog.md)
- [Public 문서 온보딩](./public-docs-onboarding.md)
- [Private 문서 온보딩](./private-docs-onboarding.md)

## 프로젝트별 문서

- [프로젝트 인덱스](./projects/index.md)
- [CMH Chatbot](./projects/cmh-chatbot/index.md)
- [AideWorks](./projects/aideworks/index.md)
- [CMH Exchange Rate](./projects/cmh-exchange-rate/index.md)

## 기존 강점 유지

기존 구조의 강점인 **기능 그룹 + 다이어그램 + trigger 기반 설명**은 그대로 유지합니다.

- 기능 그룹 인덱스: [README](./projects/cmh-chatbot/ko/core/README.md)
- 카테고리 문서: Chat/AI Runtime/Workflow/Ops/Architecture

## 로컬 실행

1. `pnpm install`
2. `pnpm docs:dev`
3. 브라우저에서 `http://127.0.0.1:4173` 접속

## 배포 목표 도메인

- `https://docs.my-mik.de/` (Public)
- `https://docs-internal.my-mik.de/` (Private)
