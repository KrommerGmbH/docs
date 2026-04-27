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
| `date` | 날짜 포맷팅 | `{{ value \| date }}` |
| `truncate` | 문자열 잘라내기 | `{{ text \| truncate(100) }}` |
| `stripHtml` | HTML 태그 제거 | `{{ html \| stripHtml }}` |
| `mediaName` | 미디어 파일명 정리 | `{{ filename \| mediaName }}` |
| `fileSize` | 파일 크기 포맷 | `{{ bytes \| fileSize }}` |

---

## 연관 파일

-----

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

-----

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

```vue
<template>
  <div>
    <!-- 날짜 포맷 -->
    <span>{{ createdAt \| date }}</span>
    <span>{{ createdAt \| date('YYYY-MM-DD') }}</span>

    <!-- 문자열 잘라내기 -->
    <span>{{ description \| truncate(200) }}</span>

    <!-- HTML 제거 -->
    <span>{{ rawHtml \| stripHtml }}</span>

    <!-- 파일 크기 -->
    <span>{{ fileSize \| fileSize }}</span> <!-- 1024 → "1 KB" -->

    <!-- 미디어 이름 -->
    <span>{{ filename \| mediaName }}</span>
  </div>
</template>
```text
---

## 필터 상세 설명

--------

### `date(value, locale?)`

----------------------

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

### `truncate(value, length = 100, suffix = '...')`

-----------------------------------------------

문자열을 지정된 길이로 자르고, 필요시 접미사 추가.

**파라미터:**

- `value`: 원본 문자열
   - `length`: 최대 길이 (기본 100)
   - `suffix`: 접미사 (기본 '...')

**예시:**

```typescript
truncate('안녕하세요 세계', 5) // "안녕하세..."
```text
---

### `stripHtml(value)`

------------------

HTML 태그를 제거하고 순수 텍스트만 반환.

**예시:**

```typescript
stripHtml('<p>안녕<br>세계</p>') // "안녕세계"
```text
---

### `mediaName(value)`

------------------

미디어 파일명에서 확장자를 제거하고 정리.

**예시:**

```typescript
mediaName('my-photo_2024.jpg') // "my-photo-2024"
```text
---

### `fileSize(value, locale?)`

--------------------------

바이트 단위를 사람이 읽기 쉬운 형식으로 변환.

**예시:**

```typescript
fileSize(1024)        // "1 KB"
fileSize(1048576)     // "1 MB"
fileSize(1073741824)  // "1 GB"
```text
---

## 디버깅 가이드

-------

### "필터가 적용되지 않음"

-------------

1. `registerFilters()`가 앱 초기화 시 호출되었는지 확인
2. Vue 컴포넌트에서 `$filters` 접근 가능한지 확인
3. 콘솔에서 `this.$filters` 확인

### "날짜 포맷이 다름"

-----------

1. 현재 로케일 확인: `i18n.locale.value`
2. `date()` 필터에 locale 파라미터 전달

---

## 관련 기능

-----

- **i18n 다국어**: F10 - 로케일별 포맷팅
   - **미디어 관리 모듈**: F43 - 파일명/크기 표시

---

## Related Docs

------------

- [i18n 다국어](../F10-i18n.md)
   - [미디어 관리 모듈](../F43-media-management.md)
