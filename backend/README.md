# KKAEDDAK Backend

KKAEDDAK의 FastAPI 백엔드입니다.

현재 구현 범위는 프로젝트 기반, 환경설정 검증, 표준 오류 응답, request ID 전파와 OpenAPI 우선 API 계약입니다. 계약 경로는 아직 저장·조회 로직을 수행하지 않으며 명시적인 `501 NOT_IMPLEMENTED`를 반환합니다.

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
