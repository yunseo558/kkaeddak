type ErrorWithStatus = {
  code?: string;
  status?: number;
};

export type ApiRecoveryKind =
  | "consent"
  | "conflict"
  | "generic"
  | "missing"
  | "privacy"
  | "rate-limit"
  | "server"
  | "session";

export type ApiRecoveryPresentation = {
  description: string;
  kind: ApiRecoveryKind;
};

export function getApiStatus(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error
    ? Number((error as ErrorWithStatus).status)
    : null;
}

export function getApiRecoveryPresentation(
  error: unknown,
): ApiRecoveryPresentation {
  const status = getApiStatus(error);
  switch (status) {
    case 401:
      return {
        kind: "session",
        description:
          "데모 세션이 만료되었습니다. 로컬 데이터는 유지한 채 시나리오를 다시 선택해 주세요.",
      };
    case 403:
      return {
        kind: "consent",
        description:
          "선택적 결과 동기화 동의가 확인되지 않았습니다. 로컬 기능은 계속 사용할 수 있습니다.",
      };
    case 404:
      return {
        kind: "missing",
        description:
          "요청한 항목을 찾지 못했습니다. 현재 화면을 유지한 채 다시 불러와 주세요.",
      };
    case 409:
      return {
        kind: "conflict",
        description:
          "다른 변경이 먼저 저장되었습니다. 최신 내용을 불러온 뒤 현재 선택을 다시 적용해 주세요.",
      };
    case 422:
      return {
        kind: "privacy",
        description:
          "전송할 수 없는 개인정보 필드가 감지되어 요청을 중단했습니다.",
      };
    case 429:
      return {
        kind: "rate-limit",
        description:
          "요청이 잠시 많습니다. 잠시 기다린 뒤 명시적으로 다시 시도해 주세요.",
      };
    case 500:
    case 503:
      return {
        kind: "server",
        description:
          "서버가 일시적으로 응답하지 않습니다. 현재 상태는 유지되며 다시 시도할 수 있습니다.",
      };
    default:
      return {
        kind: "generic",
        description:
          "요청을 완료하지 못했습니다. 현재 상태는 유지되며 다시 시도할 수 있습니다.",
      };
  }
}

export function shouldRetryApiRequest(
  failureCount: number,
  error: unknown,
) {
  const status = getApiStatus(error);
  return failureCount < 2 && [429, 500, 503].includes(status ?? 0);
}

export function apiRetryDelay(attemptIndex: number) {
  return Math.min(1_000 * 2 ** attemptIndex, 8_000);
}
