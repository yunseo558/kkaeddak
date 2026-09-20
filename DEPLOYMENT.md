# Vercel + Render 배포

같은 GitHub 저장소의 `main`을 두 서비스에 연결합니다. 저장소를 나눌 필요는 없습니다.
Vercel은 Next.js 프론트를, Render는 FastAPI와 PostgreSQL을 실행합니다.
최초 연결 이후에는 `main`에 병합하면 각 서비스가 자동 배포됩니다.
Render는 `backend` 변경을 기준으로 배포하며, 두 배포의 완료 시점은 서로 다를 수 있습니다.

**먼저 이 배포 파일 변경을 GitHub에 푸시하고 `main`에 병합해야 합니다.**
아래 `<...>`는 설명용 표시이므로 실제 대시보드 주소로 바꿔 입력합니다.

## 1. Vercel 프로젝트와 프론트 주소 만들기

1. Vercel에서 **Add New → Project**로 `yunseo558/kkaeddak`을 가져옵니다.
2. Framework Preset은 **Next.js**, Root Directory는 **`frontend`**로 설정합니다.
3. **Include source files outside of the Root Directory in the Build Step**을 켭니다.
   생성 API 클라이언트가 `backend/generated/typescript`에 있어 필요한 옵션입니다.
4. Install/Build Command는 `frontend/vercel.json` 설정을 사용합니다. 별도 Override와
   Output Directory는 기본값으로 둡니다. Production Branch는 `main`입니다.
5. 환경변수 `NEXT_PUBLIC_API_MOCKING=disabled`를 등록하고 Deploy합니다.
   `NEXT_PUBLIC_KKAEDDAK_API_BASE_URL`은 등록하지 않습니다.
6. 배포가 끝나면 **프로젝트의 고정 Production 도메인**을 복사합니다.
   배포마다 바뀌는 URL 대신 Domains에 표시되는 `https://<project>.vercel.app` 주소를 사용합니다.

이 첫 배포는 주소를 확보하는 단계입니다. 아직 API가 연결되지 않아 서버 기능은
작동하지 않습니다. 아래 3단계에서 백엔드 주소를 등록하고 다시 배포합니다.

## 2. Render에서 API와 DB 만들기

1. Render에서 GitHub를 연결한 뒤 **New → Blueprint**를 선택합니다.
2. 저장소는 `yunseo558/kkaeddak`, 브랜치는 `main`, Blueprint 경로는
   루트의 **`render.yaml`**을 선택합니다.
3. 환경변수 `KKAEDDAK_CORS_ALLOWED_ORIGINS` 입력란에 1단계의 실제 주소를
   **JSON 배열**로 입력합니다. 주소 뒤에 `/`나 페이지 경로를 붙이지 않습니다.

   ```json
   ["https://<project>.vercel.app"]
   ```

4. 리소스 목록에서 `kkaeddak-api`와 `kkaeddak-db`, 각각의 플랜을 확인하고 생성합니다.
   현재 파일은 둘 다 Free, 리전은 Singapore입니다. DB 접속 정보는 자동 연결됩니다.
5. API가 Live가 되면 서비스 상단의 **`https://<api>.onrender.com`** 주소를 복사합니다.
6. 해당 주소의 `/api/v1/health`에 접속해 HTTP 200 응답을 확인합니다.
   서버 시작 전에 마이그레이션을 실행하므로 테이블을 수동으로 만들 필요는 없습니다.

Blueprint가 넣는 설정은 다음과 같습니다. 별도의 Web Service나 DB를 중복 생성하지 않습니다.

| 항목 | 설정 |
| --- | --- |
| Runtime / Root Directory | Docker / `backend` |
| Dockerfile / Build Context | `./Dockerfile` / `.` (Root Directory 기준) |
| 시작 | `alembic upgrade head` 성공 후 Uvicorn 실행 |
| Docker Command | `sh /app/start-render.sh` |
| Health Check | `/api/v1/health` |
| DB | PostgreSQL 16, API와 같은 리전, 내부 연결 |
| 환경 | `KKAEDDAK_ENVIRONMENT=production`, `KKAEDDAK_DEBUG=false` |

Gemini로 준비 작업을 생성하려면 API 서비스의 Environment에
`KKAEDDAK_GEMINI_API_KEY`를 추가하고 재배포합니다. 키가 없어도 규칙 기반 fallback으로
데모를 사용할 수 있습니다. API 키를 Vercel의 `NEXT_PUBLIC_*` 변수나 저장소에 넣지 않습니다.

## 3. Vercel에 Render 주소 연결하기

Vercel 프로젝트 **Settings → Environment Variables**에서 Production 환경에 등록합니다.

| 이름 | 값 |
| --- | --- |
| `KKAEDDAK_BACKEND_ORIGIN` | `https://<api>.onrender.com` |
| `NEXT_PUBLIC_API_MOCKING` | `disabled` |
| `NEXT_PUBLIC_KKAEDDAK_API_BASE_URL` | 등록하지 않음 |

백엔드 주소에는 `/api/v1`이나 마지막 `/`를 붙이지 않습니다.
**Deployments → 최신 Production 배포 → Redeploy**를 실행합니다.
주소는 빌드할 때 rewrite에 들어가므로 환경변수 저장만으로는 기존 배포에 반영되지 않습니다.

브라우저는 Vercel의 `/api/v1/*`로 요청하고 Vercel이 Render에 전달합니다.
Preview 배포도 같은 백엔드를 사용하려면 위 Vercel 변수를 Preview에도 등록한 뒤 새로 빌드합니다.
사용자 체험 링크는 로그인 없이 접근할 수 있는 Production 도메인을 공유합니다.
커스텀 도메인 추가 시 Render의 CORS 배열에도 해당 HTTPS 원본을 추가합니다.

## 4. 공개 전 확인

1. Render 주소와 Vercel 주소 양쪽의 `/api/v1/health`가 HTTP 200을 반환하는지 확인합니다.
2. Vercel에서 새 데모를 시작하고 일정 연결 → 추천 → 승인 → 시간 이동 → 기상 완료를 체험합니다.
3. 새로고침 후 계획이 유지되는지, 브라우저 개발자 도구의 Network에서
   `/api/v1/demo-sessions` 등 API 요청이 성공하는지 확인합니다.
   로컬 fallback으로 화면이 보이는 것만으로 연결 성공을 판단하지 않습니다.
4. 시크릿 창에서도 Production 주소가 Vercel 로그인 없이 열리는지 확인합니다.

## 무료 플랜과 만료 세션 정리

Render 무료 Web Service는 **15분간 요청이 없으면 중지**되며 다음 접속 시 다시 시작합니다.
시연 직전에 API health URL을 열어 정상 응답을 확인하세요. 대기 없는 상시 체험이 필요하면
유료 Web Service를 선택합니다. **무료 PostgreSQL은 생성 30일 후 만료**되므로
그 이후까지 공개한다면 만료 전에 DB를 유료 플랜으로 변경해야 합니다.
Blueprint의 `plan`도 선택한 플랜과 맞춰 관리합니다.

현재 Blueprint에는 유료 Cron Job이 포함되지 않습니다. 익명 세션은 24시간 뒤 API 접근이
차단되지만 DB의 만료 행을 주기적으로 삭제하려면 Render에 별도의 Cron Job을 추가합니다.

- 저장소/브랜치: 동일 저장소 / `main`
- Runtime / Root Directory: Docker / `backend`
- Dockerfile / Context: `./Dockerfile` / `.`
- Region: Singapore (DB와 동일)
- Schedule: `0 * * * *` (매시)
- Docker Command: `python -m kkaeddak.jobs.cleanup_expired_sessions`
- 환경변수: API와 동일한 `KKAEDDAK_ENVIRONMENT`, `KKAEDDAK_DEBUG`,
  `KKAEDDAK_CORS_ALLOWED_ORIGINS`, `KKAEDDAK_DATABASE_URL`.
  DB URL은 같은 DB의 Internal Database URL을 사용합니다.

유료 API로 전환하고 여러 인스턴스를 운영한다면 마이그레이션을 Pre-Deploy Command로
분리하고 Docker Command에는 Uvicorn 시작만 남겨 중복 실행을 피합니다.

## 공식 문서

- [Vercel 모노레포와 외부 루트 파일](https://vercel.com/docs/monorepos/monorepo-faq)
- [Render Blueprint 설정](https://render.com/docs/blueprint-spec)
- [Render 모노레포 경로와 배포 범위](https://render.com/docs/monorepo-support)
- [Render 무료 플랜 제한](https://render.com/docs/free)
- [Render 배포와 Pre-Deploy Command](https://render.com/docs/deploys)
- [Render Cron Jobs](https://render.com/docs/cronjobs)
