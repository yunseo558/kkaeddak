# KKAEDDAK Backend

KKAEDDAK의 FastAPI 백엔드입니다.

현재 구현 범위는 프로젝트 기반, 환경설정 검증, 표준 오류 응답, request ID 전파, OpenAPI 우선 API 계약과 데이터베이스 기반입니다. 계약 경로는 아직 저장·조회 로직을 수행하지 않으며 명시적인 `501 NOT_IMPLEMENTED`를 반환합니다.

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
