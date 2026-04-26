import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'CMH Developer Docs',
  description: 'CMH 프로젝트 개발자 문서 포털',
  lang: 'ko-KR',
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: true,
  base: '/',
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: '홈', link: '/' },
      { text: 'Products', link: '/products/' },
      { text: 'Concepts', link: '/concepts/' },
      { text: 'Guides', link: '/guides/' },
      { text: 'References', link: '/references/' },
      { text: 'Projects', link: '/projects/' },
    ],
    sidebar: [
      {
        text: '시작',
        items: [
          { text: '문서 홈', link: '/' },
          { text: 'Public 문서 온보딩', link: '/public-docs-onboarding' },
          { text: 'Private 문서 온보딩', link: '/private-docs-onboarding' },
        ],
      },
      {
        text: 'Shopware 스타일 구조',
        items: [
          { text: 'Products', link: '/products/' },
          { text: 'Concepts', link: '/concepts/' },
          { text: 'Guides', link: '/guides/' },
          { text: 'References', link: '/references/' },
        ],
      },
      {
        text: '프로젝트 (VPSidebar)',
        items: [
          { text: '프로젝트 인덱스', link: '/projects/' },
          { text: 'CMH Chatbot', link: '/projects/cmh-chatbot/' },
          { text: 'AideWorks', link: '/projects/aideworks/' },
          { text: 'CMH Exchange Rate', link: '/projects/cmh-exchange-rate/' },
        ],
      },
      {
        text: 'CMH Chatbot 핵심 문서',
        items: [
          { text: 'README (목차+인덱스)', link: '/README' },
          { text: 'Developer Handbook', link: '/developer-handbook' },
          { text: 'Feature Catalog 62', link: '/feature-catalog-62' },
          { text: 'Feature Discovery Worklog', link: '/feature-discovery-worklog' },
        ],
      },
      {
        text: '기능 그룹 카테고리',
        items: [
          { text: 'Chat Experience', link: '/feature-category-chat-experience' },
          { text: 'AI Runtime', link: '/feature-category-ai-runtime' },
          { text: 'Workflow/Admin', link: '/feature-category-workflow-admin' },
          { text: 'Ops/Security', link: '/feature-category-ops-security' },
          { text: 'Architecture/Support', link: '/feature-category-architecture-support' },
        ],
      },
      {
        text: '심화',
        items: [
          { text: 'Feature Driven Guide', link: '/feature-driven-developer-guide' },
          { text: 'LangChain/LangGraph Catalog', link: '/langchain-langgraph-catalog' },
          { text: 'LibreChat Integration Review', link: '/librechat-integration-review' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/KrommerGmbH/docs' }],
    search: {
      provider: 'local',
    },
    footer: {
      message: 'Built with VitePress',
      copyright: '© 2026 CMH',
    },
  },
})
