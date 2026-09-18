import { createKkaeddakApiClient } from "@kkaeddak/api-client";

export const apiClient = createKkaeddakApiClient(
  process.env.NEXT_PUBLIC_KKAEDDAK_API_BASE_URL ?? "",
);
