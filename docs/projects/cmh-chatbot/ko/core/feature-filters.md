---
nav:
  title: Filters (템플릿 필터) 기능
  position: 218

---

# Filters (템플릿 필터) 기능

===================

==================================

> 버전: 1.0
> 상태: 적용
> 범위: renderer (Vue.js)

---

## 개요

--

Vue.js 템플릿에서 사용할 수 있는 커스텀 필터 함수들입니다. 날짜 포맷, 문자열 잘라내기, HTML 제거, 파일 크기 포맷 등 UI 표시를 위한 유틸리티 필터를 제공합니다.

---

## 주요 필터 목록

--------

| 필터 이름 | 역할 | 사용 예 |
|-----------|------|---------|
| `date` | 날짜 포맷팅 | `&#123;&#123; value &#124; date &#125;&#125;` |
| `truncate` | 문자열 잘라내기 | `&#123;&#123; text &#124; truncate(100) &#125;&#125;` |
| `stripHtml` | HTML 태그 제거 | `&#123;&#123; html &#124; stripHtml &#125;&#125;` |
| `mediaName` | 미디어 파일명 정리 | `&#123;&#123; filename &#124; mediaName &#125;&#125;` |
| `fileSize` | 파일 크기 포맷 | `&#123;&#123; bytes &#124; fileSize &#125;&#125;` |

---

## 연관 파일

----

| 파일 | 필드 |
|------|------|
| `src/renderer/app/filter/date.filter.ts` | 날짜 포맷 |
| `src/renderer/app/filter/truncate.filter.ts` | 문자열 자름 |
| `src/renderer/app/filter/striphtml.filter.ts` | HTML 제거 |
| `src/renderer/app/filter/media-name.filter.ts` | 미디어 이름 |
| `src/renderer/app/filter/file-size.filter.ts` | 파일 크기 |
| `src/renderer/app/filter/index.ts` | 필터 등록 |

---

## 사용 방법

----

### 1. 필터 등록 (자동)

-------------

```typescript
// src/renderer/app/filter/index.ts
export function registerFilters(app: App): void {
  app.config.globalProperties.$filters = Filters;
}
```text
### 2. Vue 템플릿에서 사용

---------------

```html
<template>
  <div>
    <!-- 날짜 포맷 -->
    <span>{{ createdAt | date }}</span>
    <span>{{ createdAt | date('YYYY-MM-DD') }}</span>

    <!-- 문자열 잘라내기 (truncate 필터는 src/renderer/app/filter/truncate.filter.ts에 정의됨) -->
    <span>{{ description | truncate(200) }}</span>

    <!-- HTML 제거 -->
    <span>{{ rawHtml | stripHtml }}</span>

    <!-- 파일 크기 -->
    <span>{{ fileSize | fileSize }}</span> <!-- 1024 → "1 KB" -->

    <!-- 미디어 이름 -->
    <span>{{ filename | mediaName }}</span>
  </div>
</template>
```text
---

## 필터 상세 설명

--------

### `date(value, locale?)`

---------------------

날짜를 locale에 맞게 포맷팅합니다.

**파라미터:**

- `value`: ISO 날짜 문자열 또는 Date 객체
   - `locale`: 로케일 (기본: 현재 로케일)

**예시:**

```typescript
date('2024-01-15T10:30:00Z') // "2024. 1. 15." (ko-KR)
date('2024-01-15', 'en-GB')  // "15/01/2024"
```text
---

### `truncate(text, length, suffix?)`

-------------------------

문자열을 지정한 길이로 자르고 필요시 접미사를 추가합니다.

**파라미터:**

- `text`: 원본 문자열
- `length`: 최대 길이
- `suffix`: 접미사 (기본: `...`)

**예시:**

```typescript
truncate('Hello World', 5)     // "Hello..."
truncate('Hello World', 5, '') // "Hello"
```text
---

### `stripHtml(html)`

----------------

HTML 태그를 제거하고 순수 텍스트만 반환합니다.

**파라미터:**

- `html`: HTML 문자열

**예시:**

```typescript
stripHtml('<p>Hello <b>World</b></p>') // "Hello World"
```text
---

### `mediaName(filename)`

---------------------

미디어 파일명에서 경로와 확장자를 정리하여 표시 이름을 반환합니다.

**파라미터:**

- `filename`: 미디어 파일명 또는 경로

**예시:**

```typescript
mediaName('uploads/2024/01/image.jpg') // "image"
```text
---

### `fileSize(bytes, decimals?)`

-------------------------

바이트 단위를 사람이 읽기 쉬운 형식으로 변환합니다.

**파라미터:**

- `bytes`: 파일 크기(바이트)
- `decimals`: 소수점 자리수 (기본: 2)

**예시:**

```typescript
fileSize(1024)        // "1 KB"
fileSize(1048576)     // "1 MB"
fileSize(1500, 0)     // "1 KB"
```text
---

## Related Docs

- [Feature Catalog (62개 기능)](./feature-catalog-62.md)
- [Developer Handbook](./developer-handbook.md)
- [Vue.js Filters 공식 문서](https://vuejs.org/guide/essentials/filters.html)
