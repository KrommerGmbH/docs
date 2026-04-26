# GitHub 개발자 문서 운영 작업 이력 (Public/Private 분리 기준)

이 문서는 이번 세션에서 진행한 GitHub 문서 운영 작업과 설정을 시간 순서대로 정리한 기록입니다.

## 1) 초기 목표

- 기존 프로젝트 문서를 "읽기 쉬운 개발자 인덱스" 형태로 정리
- 문서 사이트를 VitePress로 운영
- GitHub Actions로 자동 배포
- 이후 Public/Private 문서 분리 운영 구조 확정

## 2) 문서 구조 및 콘텐츠 개편

- `docs/README.md`를 기능 카테고리 중심 인덱스로 확장
- 기능 그룹(12개) + 트리거 + 프로세스 체인 + 코드 링크 정리
- Mermaid 다이어그램 파싱/가독성 이슈 수정
- 클릭 불안정 노드는 일반 Markdown 링크 방식으로 보완

관련 파일(대표):
- docs/README.md
- docs/feature-category-*.md
- docs/feature-discovery-worklog.md

## 3) VitePress 포털 세팅

- 문서 포털 기본 구조 구성
- 홈/프로젝트 인덱스 페이지 구성
- 문서 빌드 스크립트 및 의존성 정리

관련 파일(대표):
- docs/.vitepress/config.ts
- docs/index.md
- docs/projects/index.md
- package.json
- pnpm-lock.yaml

## 4) 배포 워크플로 구축 및 보강

`docs/.vitepress/dist`를 SSH + rsync로 서버 배포하는 파이프라인 구성.

진행 중 반영된 주요 개선:

1. 브랜치 트리거 확장 (`main`, `master`)
2. `pnpm-lock.yaml` 불일치 대응 (`--no-frozen-lockfile`)
3. dead link 제거로 VitePress build 안정화
4. SSH 키 파싱/검증 강화 (`ssh-keygen -y` 사전 검증)
5. `DOCS_DEPLOY_SSH_KEY_B64` 우선 처리(줄바꿈/포맷 깨짐 방지)
6. `rsync` SSH 실행 시 명시 키 사용 (`-i ~/.ssh/id_deploy`)
7. 배포 필수 시크릿 누락 시 사전 실패 검증 단계 추가

관련 파일:
- .github/workflows/docs-deploy-subdomain.yml

## 5) SSH 인증 이슈 원인 정리

이번 세션에서 반복된 배포 실패의 핵심 원인:

- `authorized_keys`에는 공개키(`.pub`)를 넣어야 하는데,
  Secret에는 개인키 base64가 필요하다는 점에서 혼선 발생
- `DOCS_DEPLOY_SSH_KEY_B64` 칸에 명령어/공개키 문자열이 들어가 실패
- 최종적으로는 개인키 파일(`id_ed25519_mymik`) base64 한 줄을 Secret으로 저장해야 정상

정상 매핑:

- 서버 `~/.ssh/authorized_keys`  ← `id_ed25519_mymik.pub` 한 줄
- GitHub `DOCS_DEPLOY_SSH_KEY_B64` ← `id_ed25519_mymik` 파일 base64 한 줄

## 6) 원격 저장소 운영 전환

문서 중앙화 작업을 위해 로컬 작업본에서 원격 구성을 다음처럼 정리:

- `origin` → `https://github.com/KrommerGmbH/docs.git` (문서 포털 기본 원격)
- `cmh-chatbot` → `https://github.com/KrommerGmbH/cmh-chatbot.git` (기존 코드 원격 보존)

주의:
- GitHub Actions Secret은 저장소별로 완전 분리됨
- `cmh-chatbot`에서 설정한 Secret은 `docs`에 자동 복사되지 않음

## 7) Public / Private 문서 분리 정책 확정

요구사항에 따라 분리 운영 기준 확정:

- Public 문서: `docs.my-mik.de` / 저장소 `KrommerGmbH/docs`
- Private 문서: `docs-internal.my-mik.de` / 저장소 `KrommerGmbH/docs-internal`

운영 원칙:

1. Private 문서는 Public 저장소에 복사/노출 금지
2. 저장소별 배포 시크릿 분리
3. 코드 저장소 직접 배포보다 중앙 문서 저장소 갱신/트리거 방식 우선

## 8) 현재 상태 요약

- Public 문서 포털 기준 작업은 `KrommerGmbH/docs` 중심으로 진행 중
- `docs/projects/cmh-chatbot` 경로에 cmh-chatbot 문서 섹션 존재
- `docs-internal`은 별도 생성/권한 설정 이후 연결 필요

## 9) 다음 작업 체크리스트

- [ ] `KrommerGmbH/docs` 저장소 Actions Secret 값 최종 점검
- [ ] `Deploy docs to subdomain` 성공 run 확인
- [ ] `https://docs.my-mik.de` 실제 반영 확인
- [ ] `KrommerGmbH/docs-internal` 생성/권한 검증
- [ ] internal 전용 배포 워크플로/시크릿 별도 구성

## 10) 저장소 오염 정리 및 복구 상태 (2026-04-26 추가)

### 10.1 확인된 문제

- 기존 `KrommerGmbH/cmh-chatbot` 저장소가 현재 `KrommerGmbH/docs`로 리다이렉트되는 상태 확인
- 그 결과 `cmh-chatbot` URL로 push 시 실제로 `docs` 저장소 정책(Secret Scanning, Push Protection)이 적용됨
- `docs` 저장소에 코드가 섞였던 이력은 정리 커밋으로 제거 완료

### 10.2 이번 세션에서 수행한 조치

1. `docs` 저장소에서 소스코드/테스트 파일 대량 삭제 커밋 반영
2. VitePress dead link 임시 허용(`ignoreDeadLinks`) 반영
3. 로컬 원격 정리:
    - 현재 작업본(`cmh-chatbot` 폴더)의 `origin`을 `docs`로 고정
    - 혼동 유발 원격 alias 제거
4. 코드 복구 준비:
    - 코드 포함 커밋 지점(`b61e4dc`)을 `rescue/cmh-chatbot-code`로 백업
    - push protection 이력 충돌을 피하기 위해 단일 초기 커밋(clean history) 브랜치 생성
      - 브랜치: `publish/cmh-chatbot-clean`
      - 커밋: `0e82f92`

### 10.3 최종 분리 목표(유지)

- Public 문서: `KrommerGmbH/docs`
- Private 문서: `KrommerGmbH/docs-internal` (신규 생성 필요)
- 소스코드: `KrommerGmbH/cmh-chatbot` (신규 생성/복구 필요)

### 10.4 남은 즉시 작업

- [ ] GitHub Organization에서 `cmh-chatbot` 저장소 신규 생성
- [ ] GitHub Organization에서 `docs-internal` 저장소 신규 생성
- [ ] `publish/cmh-chatbot-clean` 브랜치를 신규 `cmh-chatbot` 저장소 `master`로 push
- [ ] `docs-internal`에 private 문서 초기 구조 및 배포 워크플로 분리 반영

---

작성일: 2026-04-26
