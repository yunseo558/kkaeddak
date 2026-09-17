# 프론트엔드 API 인계

## 계약 산출물

- OpenAPI JSON: [`../openapi.json`](../openapi.json)
- TypeScript 타입·클라이언트: [`typescript`](typescript)
- Postman 데모 컬렉션: [`postman/kkaeddak-demo.postman_collection.json`](postman/kkaeddak-demo.postman_collection.json)
- API base URL 프론트 환경변수: `NEXT_PUBLIC_KKAEDDAK_API_BASE_URL`
- 세션 헤더: `X-Demo-Session`
- 멱등성 헤더: `Idempotency-Key`

OpenAPI 변경 이력은 Git 히스토리로 관리합니다. 이 단계에서는 시나리오 예시로 인해 `DemoSessionCreate.scenarioId`의 OpenAPI 예시가 추가되어 OpenAPI가 갱신됩니다.

## 데모 시나리오

| 화면 ID | 화면 표시 | 서버 시드 |
| --- | --- | --- |
| `regular-class` | 일반 수업날 | 오전 10시 일반 수업 |
| `exam-morning` | 오전 시험 | 오전 9시 중요 시험 |
| `tired-interview` | 피곤한 면접날 | 오전 8시 30분 중요 면접 |

기본값은 `exam-morning`입니다. 프론트가 `POST /api/v1/demo-sessions`에 화면 ID를 보내면 응답의 `sessionId`를 저장하고, 해당 세션 헤더로 후속 API를 호출합니다.

## 에러 UX 기준

| HTTP/코드 | 기본 UX |
| --- | --- |
| `401 SESSION_INVALID` | 세션을 재발급하고 시나리오 선택 화면으로 이동 |
| `403 OUTCOME_SYNC_NOT_ALLOWED` | 집계 동기화 설정을 안내 |
| `404 *_NOT_FOUND` | 새로고침·재조회를 안내한 후 이전 화면을 보존 |
| `409 REVISION_CONFLICT` | 최신 데이터를 새로고침한 다음 수정을 재시도하도록 안내 |
| `409 IDEMPOTENCY_KEY_REUSED` | 이전 요청을 중복 제출하지 않고 결과를 재조회 |
| `422 PRIVACY_FIELD_NOT_ALLOWED` | 거부된 민감 필드를 안내하고 해당 입력은 저장하지 않음 |
| `429` | 잠시 후 재시도 안내 |
| `500`, `503` | 재시도 버튼을 제공하고 문제 발생 시나리오를 유지 |

## 8단계로 남긴 항목

배포·CORS 허용 도메인과 운영 헬스체크 구현은 다음 단계에서 확정합니다. 현 단계에서는 운영 CORS 정책이나 배포 주소 모니터링을 추가하지 않습니다.
