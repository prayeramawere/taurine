import type { RouteContext } from "./supabase";
import { errorResponse, readJsonBody, resolveRouteId, sanitizePayload } from "./supabase";

export async function getIdFromContext(
  params: RouteContext["params"],
  key: "id" | "mediaId" = "id",
) {
  return resolveRouteId(params, key);
}

export async function getRequestBody(request: Request) {
  return readJsonBody(request);
}

export function getValidPayload(payload: Record<string, unknown> | undefined, allowedKeys: string[]) {
  if (!payload || Object.keys(payload).length === 0) {
    return {};
  }

  return sanitizePayload(payload, allowedKeys);
}

export function requirePayload(payload: Record<string, unknown>, message: string) {
  if (!payload || Object.keys(payload).length === 0) {
    return errorResponse("VALIDATION_ERROR", message, 400);
  }

  return null;
}
