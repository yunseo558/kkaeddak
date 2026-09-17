# KKAEDDAK API Client

`../../openapi.json`에서 재생성한 TypeScript 타입과 `openapi-fetch` 클라이언트입니다. 프론트에는 별도 DTO를 제작하지 말고 이 패키지를 직접 사용하세요.

```bash
npm ci
npm test
```

OpenAPI 계약이 바뀌면 타입을 다시 생성하고 검증합니다.

```bash
npm run generate
npm test
```

```ts
import { createKkaeddakApiClient, demoSessionHeaders } from "@kkaeddak/api-client";

const api = createKkaeddakApiClient(process.env.NEXT_PUBLIC_KKAEDDAK_API_BASE_URL!);
const result = await api.GET("/api/v1/me", {
  headers: demoSessionHeaders(sessionId),
});
```

`baseUrl`에는 `/api/v1`을 포함하지 않은 API 오리진만 전달하세요. 데모 세션 이후 요청에는 `X-Demo-Session`을 헤더로 보내고, 기상 계획·집계 결과 등록에는 `Idempotency-Key`를 추가하세요.
