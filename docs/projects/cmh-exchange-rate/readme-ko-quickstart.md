---
nav:
  title: CMH Exchange Rate Quickstart (KO)
  position: 310

---

# CMH Exchange Rate Quickstart (KO)

=================================

=================================

=================================

원본: `cmh-exchange-rate/README.ko.md`

## 핵심 기능

-----

-----

-----

- `getCurrentRates()` 현재 환율
   - `getCrossRate(from, to)` 크로스 환율
   - `getHistoricalRates()` 히스토리 조회

## 데이터 소스

------

------

------

1. ECB daily (기본)
2. Yahoo Finance (fallback)
3. 메모리 캐시(TTL)

## 초급자 시작 코드

---------

---------

---------

1. 패키지 설치
2. `ExchangeRateClient` 생성
3. 현재 환율 조회
4. 소스(`ecb|yahoo|cache`) 확인
