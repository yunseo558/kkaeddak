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

## 검증

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
