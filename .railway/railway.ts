import { defineRailway, github, postgres, project, service } from "railway/iac";

const repository = github("yunseo558/kkaeddak", {
  branch: "main",
  rootDirectory: "backend",
});

const build = {
  builder: "DOCKERFILE" as const,
  dockerfilePath: "Dockerfile",
};

export default defineRailway((context) => {
  const database = postgres("postgres");
  const environment = {
    KKAEDDAK_CORS_ALLOWED_ORIGINS: context.shared.KKAEDDAK_CORS_ALLOWED_ORIGINS,
    KKAEDDAK_DATABASE_URL: database.env.DATABASE_URL,
    KKAEDDAK_DEBUG: "false",
    KKAEDDAK_ENVIRONMENT: "production",
  };

  const api = service("api", {
    source: repository,
    build,
    start: "uvicorn kkaeddak.main:app --host 0.0.0.0 --port $PORT",
    preDeploy: "alembic upgrade head",
    healthcheck: "/api/v1/health",
    healthcheckTimeout: 120,
    env: environment,
    deploy: {
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 3,
    },
  });

  const cleanup = service("cleanup-expired-sessions", {
    source: repository,
    build,
    start: "python -m kkaeddak.jobs.cleanup_expired_sessions",
    env: environment,
    deploy: {
      cronSchedule: "0 * * * *",
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 1,
    },
  });

  return project("kkaeddak", {
    resources: [database, api, cleanup],
  });
});
