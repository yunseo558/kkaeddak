FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install --no-cache-dir .

COPY alembic.ini ./alembic.ini
COPY alembic ./alembic

EXPOSE 8000

CMD ["sh", "-c", "uvicorn kkaeddak.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
