# KKAEDDAK Frontend

깨딱 웹 데모의 Next.js 프론트엔드입니다. 실제 HealthKit 또는 시스템 알람 연결을 가장하지 않고, 샘플·직접 입력 데이터로 제품의 의사결정 흐름을 보여줍니다.

## 요구 사항

- Node.js 20.9 이상
- 로컬 백엔드 연동 시 KKAEDDAK API 실행

## 로컬 실행

```bash
cp .env.example .env.local
npm install
npm run dev
```

기본 주소는 `http://localhost:3000`입니다. `.env.local`에서 `NEXT_PUBLIC_API_MOCKING=enabled`를 사용하면 MSW가 데모 세션 API를 모킹합니다. 실제 백엔드를 사용할 때는 값을 `disabled`로 바꾸고 `KKAEDDAK_BACKEND_ORIGIN`을 설정합니다.

## API 계약

API 요청·응답 타입은 `../backend/generated/typescript`의 `@kkaeddak/api-client`를 사용합니다. DTO를 프론트에서 별도로 정의하지 않습니다.

로컬 개발에서는 `/api/v1/*` 요청을 `KKAEDDAK_BACKEND_ORIGIN`으로 rewrite해 브라우저의 교차 출처 요청을 피합니다.

## 로컬 데이터

수면·활동·컨디션 샘플은 IndexedDB의 `health-inputs`, 개인 모델은 `wake-model`, 기상 이벤트 원본은 `wake-events`에만 저장합니다. IndexedDB를 사용할 수 없으면 해당 브라우저 세션 동안만 유지되는 일회성 모드로 전환합니다. `/settings/privacy`에서 세 저장소와 현재 진행 상태를 함께 삭제할 수 있습니다.

## 내일 일정과 준비

`/tomorrow`는 가장 이른 일정과 아침 루틴을 조회해 일정 시작 시각에서 루틴·이동 여유 시간을 역산합니다. `/prepare`는 전날 완료할 수 있는 작업을 제안하며, `COMPLETED` 상태인 작업의 시간만 조정된 기상 마감에 반영합니다. 이 계산에는 건강 입력이나 개인 모델을 사용하지 않습니다.

## 로컬 기상 추천

`/plan`은 IndexedDB의 로컬 건강 입력과 개인 기준선을 브라우저 안에서만 계산해 최소 유효 알람을 제안합니다. 서버에는 건강 원본 대신 `reasonCodes`, 알람 시각·단계, 승인 필요 여부로 구성된 OpenAPI 계약 객체만 멱등 저장합니다. 사용자는 계획을 승인·수정·거절할 수 있습니다.

## 기상 실행과 결과 학습

`/wake`는 실제 시스템 알람이나 센서를 제어하지 않고 `RINGING`부터 `CONFIRMED`까지의 상태 전이를 사용자 버튼으로 시뮬레이션합니다. 전이 원본과 개인 학습 모델은 IndexedDB에만 저장하며, `/result`에서는 사용한 알람 수와 다음 추천 변화를 확인합니다. 집계 결과는 로컬 설정과 서버 프로필 양쪽에서 동의가 확인된 경우에만 `POST /wake-outcomes`로 전송합니다. `/history`는 동의 상태에 따라 서버 집계 또는 브라우저 로컬 기록을 표시합니다.

## 오프라인·오류 복구와 접근성

서버 데모 중 네트워크가 끊기면 현재 브라우저의 로컬 데이터로 계속하며, 세션 만료·동의 필요·수정 충돌·요청 제한·일시적 서버 오류를 구분해 복구 행동을 안내합니다. 일시적 조회 오류만 제한적으로 재시도하고, 수정 요청은 자동으로 반복하지 않습니다.

집계 결과의 서버 동기화는 `/settings/privacy`에서 사용자가 명시적으로 저장해야 활성화됩니다. 세션을 다시 선택해도 로컬 건강 입력과 학습 모델은 유지됩니다.

핵심 화면은 본문 바로가기, 키보드 포커스, 최소 터치 영역, 동작 줄이기 설정과 200% 재배치를 고려합니다. jsdom 접근성 회귀 테스트는 `axe-core`로 시나리오 선택과 기상 실행 화면을 검사합니다. 색상 대비와 실제 줌 레이아웃은 브라우저 수동 검증 대상입니다.

## 검증

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

`test:e2e`는 실제 FastAPI·SQLite와 Next.js를 함께 실행해 세 시나리오, 새로고침 복구, 오프라인 폴백을 검증합니다. Chromium `1440×900`과 WebKit `390×844`에서 시작 화면의 스크린샷 회귀도 확인합니다. 최초 실행 전에 `npx playwright install chromium webkit`으로 브라우저를 준비합니다.

## Vercel 배포

루트의 `vercel.json`은 모노레포에서 `frontend` 앱과 생성 OpenAPI 클라이언트를 함께 빌드합니다. Vercel 프로젝트의 Root Directory는 저장소 루트로 유지하고 다음 환경변수를 설정합니다.

```dotenv
KKAEDDAK_BACKEND_ORIGIN=https://<railway-api-domain>
NEXT_PUBLIC_KKAEDDAK_API_BASE_URL=
NEXT_PUBLIC_API_MOCKING=disabled
```

브라우저는 같은 원본의 `/api/v1/*`를 호출하고 Next.js rewrite가 Railway API로 전달합니다. 직접 API 호출과 운영 점검을 위해 Railway의 `KKAEDDAK_CORS_ALLOWED_ORIGINS`에 실제 Vercel 도메인을 같이 설정합니다.
