---
nav:
  title: 서브도메인 배포 가이드
  position: 90

---

# 서브도메인 배포 가이드 (A 전략: 단일 저장소)

===========================

===========================

===========================

===========================

대상 도메인: **[www.cmh-chatbot.developer.my-mik.de](http://www.cmh-chatbot.developer.my-mik.de)**

## 1) 핵심 구조

--------

--------

--------

--------

- 문서 소스: `docs/*.md`
   - VitePress 설정: `docs/.vitepress/config.ts`
   - 빌드 결과: `docs/.vitepress/dist`
   - CI 배포: `.github/workflows/docs-deploy-subdomain.yml`

## 2) DNS

------

------

------

------

`www.cmh-chatbot.developer.my-mik.de`를 웹서버 IP로 A 레코드 연결.

## 3) 웹서버(Nginx 예시)

----------------

----------------

----------------

----------------

```nginx
server {
  listen 80;
  server_name www.cmh-chatbot.developer.my-mik.de;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name www.cmh-chatbot.developer.my-mik.de;

  root /var/www/cmh-chatbot-docs;
  index index.html;

  ssl_certificate /etc/letsencrypt/live/www.cmh-chatbot.developer.my-mik.de/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/www.cmh-chatbot.developer.my-mik.de/privkey.pem;

  location / {
    try_files $uri $uri.html $uri/ /index.html;
  }
}
```text

## 4) GitHub Secrets 설정

--------------------

--------------------

--------------------

--------------------

- `DOCS_DEPLOY_HOST`: 서버 호스트
   - `DOCS_DEPLOY_PORT`: SSH 포트(예: 22)
   - `DOCS_DEPLOY_USER`: SSH 사용자
   - `DOCS_DEPLOY_PATH`: 배포 경로(예: `/var/www/cmh-chatbot-docs`)
   - `DOCS_DEPLOY_SSH_KEY`: 배포용 private key

## 5) 로컬 테스트

---------

---------

---------

---------

1. `pnpm install`
2. `pnpm docs:dev`
3. `pnpm docs:build`
4. `pnpm docs:preview`

## 6) 멀티 프로젝트 확장 방식

----------------

----------------

----------------

----------------

현재는 단일 저장소 시작(A 전략).

확장 시 권장:

- `docs/projects/aideworks/index.md`
   - `docs/projects/cmh-exchange-rate/index.md`

그리고 `docs/.vitepress/config.ts`의 `nav`/`sidebar`에 프로젝트 항목만 추가.

즉, **폴더를 밖으로 빼지 않고도** 한 포털에서 여러 프로젝트 문서를 함께 운영할 수 있습니다.
