# KKAEDDAK Backend

KKAEDDAK의 FastAPI 백엔드입니다.

현재 구현 범위는 프로젝트 기반, 환경설정 검증, 표준 오류 응답, request ID 전파입니다. 도메인 스키마와 데이터베이스, 업무 API는 이후 단계에서 추가합니다.

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
