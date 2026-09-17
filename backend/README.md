# KKAEDDAK Backend

KKAEDDAK의 FastAPI 백엔드입니다.

현재 구현 범위는 프로젝트 기반, OpenAPI 계약, 데이터베이스 계층과 데모 세션·프로필·루틴·정규화 일정·준비 작업·기상 계획·집계 결과·추천 이유 API입니다. 헬스체크 경로는 후속 단계 전까지 명시적인 `501 NOT_IMPLEMENTED`를 반환합니다.

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

`POST /api/v1/demo-sessions`로 발급한 `sessionId`는 24시간 동안 유효합니다. 이후 세션 API에는 `X-Demo-Session: <sessionId>` 헤더를 전달합니다. `exam-morning` 시나리오는 기본 프로필, 아침 루틴과 다음 오전 9시 시험 일정을 생성합니다.

기상 계획과 집계 결과 등록에는 `Idempotency-Key` 헤더가 필요합니다. 계획과 준비 작업의 변경 요청은 최신 `revision`을 전달해야 하며, 집계 결과는 프로필에서 `allowAggregateOutcomeSync`를 활성화한 경우에만 저장됩니다. 원시 건강·센서 데이터는 이 API 범위에 포함하지 않습니다.

모든 JSON 요청은 중첩된 금지 건강·센서 필드까지 검사하며 발견 시 `422 PRIVACY_FIELD_NOT_ALLOWED`를 반환합니다. 서버 AI에는 정규화된 일정 정보, 루틴 코드, 제한된 추천 이유만 전달할 수 있습니다. AI 공급자는 `create_app(ai_provider=...)`으로 주입하며, 미설정·타임아웃·스키마 검증 실패 시 준비 작업과 추천 이유를 규칙 템플릿으로 반환합니다. AI 실행 로그에는 요청 본문이나 응답 전문 대신 기능, 상태, 지연시간과 허용 입력의 해시만 저장합니다.

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

## 데이터베이스

운영 데이터베이스는 PostgreSQL 16 이상을 사용하고 SQLAlchemy 비동기 세션으로 접근합니다. 테스트에서는 동일한 모델과 마이그레이션을 SQLite로 검증합니다.

```bash
cd backend
cp .env.example .env
.venv/bin/alembic upgrade head
.venv/bin/alembic check
```

초기 마이그레이션은 서버가 소유하는 비민감 데이터 테이블만 생성합니다. 원시 건강·생리·심박·위치·센서 데이터는 스키마에 포함하지 않습니다.
