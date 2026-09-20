# KKAEDDAK Backend

KKAEDDAK의 FastAPI 백엔드입니다.

현재 구현 범위는 프로젝트 기반, OpenAPI 계약, 데이터베이스 계층과 데모 세션·프로필·루틴·정규화 일정·준비 작업·기상 계획·집계 결과·추천 이유 API와 운영 헬스체크입니다.

## 요구 사항

- Python 3.12 이상

## 로컬 실행

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/python -m pip install -e '.[dev]'
cp .env.example .env
.venv/bin/uvicorn kkaeddak.main:app --reload
```

환경변수는 `KKAEDDAK_` 접두사를 사용합니다. 잘못된 값은 애플리케이션 시작 시 검증 오류를 발생시킵니다.

`POST /api/v1/demo-sessions`로 발급한 `sessionId`는 24시간 동안 유효합니다. 이후 세션 API에는 `X-Demo-Session: <sessionId>` 헤더를 전달합니다. `regular-class`, `exam-morning`, `tired-interview` 시나리오는 각각 오전 수업, 오전 시험, 오전 면접 일정을 포함하는 기본 프로필과 아침 루틴을 생성합니다.

기상 계획과 집계 결과 등록에는 `Idempotency-Key` 헤더가 필요합니다. 계획과 준비 작업의 변경 요청은 최신 `revision`을 전달해야 하며, 집계 결과는 프로필에서 `allowAggregateOutcomeSync`를 활성화한 경우에만 저장됩니다. 원시 건강·센서 데이터는 이 API 범위에 포함하지 않습니다.

모든 JSON 요청은 중첩된 금지 건강·센서 필드까지 검사하며 발견 시 `422 PRIVACY_FIELD_NOT_ALLOWED`를 반환합니다. 서버 AI에는 정규화된 일정 정보, 루틴 코드, 제한된 추천 이유만 전달할 수 있습니다. AI 공급자는 `create_app(ai_provider=...)`으로 주입하며, 미설정·타임아웃·스키마 검증 실패 시 준비 작업과 추천 이유를 규칙 템플릿으로 반환합니다. AI 실행 로그에는 요청 본문이나 응답 전문 대신 기능, 상태, 지연시간과 허용 입력의 해시만 저장합니다.

Gemini Provider는 API 키가 설정된 경우 활성화됩니다. 실제 값은 저장소에
커밋하지 않습니다. 모델 기본값은 `gemini-2.5-flash-lite`입니다.

- `KKAEDDAK_GEMINI_API_KEY`
- `KKAEDDAK_GEMINI_MODEL` (선택)
- `KKAEDDAK_GEMINI_TIMEOUT_SECONDS` (선택, 기본 10초)

개인화 요청은 명시적 AI 분석 동의가 필수이며, 일정 제목과 건강·센서 원본은
전송하지 않습니다. 외부 AI에는 수면 분, 활동·컨디션 등급, 최근 기상
성공·지각·미확인 횟수 등 요약값만 보냅니다. Gemini는 피로도, 첫 알람
시작 시각, 알람 개수·간격과 판단 근거를 JSON Schema 구조화 출력으로
반환합니다. 서버는 최대 5개·90분 범위와 14일 승인 정책을 따로 검증합니다.

OpenAI Provider도 둘 다 설정된 경우에만 활성화됩니다. Gemini와 OpenAI가
모두 설정되면 Gemini를 우선합니다.

- `KKAEDDAK_OPENAI_API_KEY`
- `KKAEDDAK_OPENAI_MODEL`
- `KKAEDDAK_OPENAI_TIMEOUT_SECONDS` (선택, 기본 10초)

미설정 시에는 규칙 기반 fallback을 사용합니다. 두 Provider 모두
`store: false`와 구조화 출력을 사용합니다.

## 검증

```bash
cd backend
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/pytest --cov=kkaeddak --cov-report=term-missing
```

## OpenAPI 계약

문서에 정의된 API 경로와 Pydantic 스키마는 `openapi.json`으로 고정합니다.

```bash
cd backend
.venv/bin/python scripts/export_openapi.py
.venv/bin/pytest tests/test_openapi_contract.py
```

프론트에는 OpenAPI로부터 재생성한 TypeScript 클라이언트로 연결합니다.

```bash
cd backend/generated/typescript
npm ci
npm test
```

사용 방법과 데모 시나리오, 에러 코드 UX 매핑은 [`generated/frontend-handoff.md`](generated/frontend-handoff.md)로 함께 제공합니다.

## 데이터베이스

운영 데이터베이스는 PostgreSQL 16 이상을 사용하고 SQLAlchemy 비동기 세션으로 접근합니다. 테스트에서는 동일한 모델과 마이그레이션을 SQLite로 검증합니다.

```bash
cd backend
cp .env.example .env
.venv/bin/alembic upgrade head
.venv/bin/alembic check
```

초기 마이그레이션은 서버가 소유하는 비민감 데이터 테이블만 생성합니다. 원시 건강·생리·심박·위치·센서 데이터는 스키마에 포함하지 않습니다.

## 운영 배포

Railway 백엔드는 루트의 `.railway/railway.ts`와 `backend/Dockerfile`을 사용합니다. Railway 환경의 공유 변수에 실제 Vercel 원본을 먼저 등록합니다.

```dotenv
KKAEDDAK_CORS_ALLOWED_ORIGINS=["https://<vercel-domain>"]
```

Railway CLI 5.42.1 이상으로 프로젝트를 연결하고 IaC 변경을 검토·적용합니다.

```bash
railway login
railway link
railway config plan
railway config apply
```

IaC는 PostgreSQL, API, 매시 실행되는 만료 세션 정리 서비스를 함께 정의합니다. API 배포 전에 `alembic upgrade head`가 실행되고 `/api/v1/health`가 API·DB·마이그레이션 상태를 검사합니다. 정리 서비스는 같은 이미지에서 다음 명령을 실행하고 종료합니다.

```bash
python -m kkaeddak.jobs.cleanup_expired_sessions
```

운영 CORS는 와일드카드를 허용하지 않으며 HTTPS 원본을 최소 하나 명시해야 시작됩니다. IaC 적용 후 API 서비스에 Railway 생성 도메인을 발급하고 그 주소를 Vercel의 `KKAEDDAK_BACKEND_ORIGIN`으로 설정합니다.
