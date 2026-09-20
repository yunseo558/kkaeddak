# KKAEDDAK 깨딱

일정과 개인 상태를 바탕으로 기상 난이도를 추정하고, 필요한 최소한의 알람으로 실제 기상 완료까지 확인하는 AI 기상 에이전트입니다.

## 프로젝트 구조

- `backend/`: FastAPI 기반 백엔드
- `frontend/`: Next.js App Router 기반 웹 데모


## 핵심 원칙

- 알람 종료가 아니라 실제 기상 완료를 학습합니다.
- 목표 신뢰도를 만족하는 가장 낮은 강도의 알람 계획을 선택합니다.
- 원시 건강·생리·심박·위치·센서 데이터는 서버로 전송하지 않습니다.
- 중요 일정과 불확실한 상황에서는 사용자 승인을 우선합니다.

## 백엔드 기술 기준

- Python 3.12+
- FastAPI 및 Pydantic
- SQLAlchemy 2 및 Alembic
- PostgreSQL 16+
- OpenAPI 3.1

## 프론트엔드 기술 기준

- Next.js App Router와 TypeScript
- Tailwind CSS
- TanStack Query와 Zustand
- React Hook Form과 Zod
- IndexedDB와 MSW
- OpenAPI 생성 TypeScript 클라이언트

로컬 실행과 검증 방법은 [`frontend/README.md`](frontend/README.md)를 참고합니다.

## 배포

한 저장소의 `main`을 Vercel(프론트)과 Render(API·PostgreSQL)에 연결합니다.
웹사이트에서 입력할 설정과 최초 배포 순서는 [DEPLOYMENT.md](DEPLOYMENT.md)에 있습니다.
