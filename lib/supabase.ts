import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export type RouteContext = {
  params?: Record<string, string | string[] | undefined> | Promise<Record<string, string | string[] | undefined>>;
};

export function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase environment variables are not configured.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase server credentials are not configured.");
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function okResponse(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function errorResponse(
  code: string,
  message: string,
  status = 400,
  details?: unknown,
) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
      },
    },
    { status },
  );
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();

  if (!text.trim()) {
    return {};
  }

  try {
    const payload = JSON.parse(text);

    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      return payload as Record<string, unknown>;
    }

    throw new Error("Request body must be a JSON object.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON body.";
    throw new Error(message);
  }
}

export async function resolveRouteId(
  params: RouteContext["params"],
  key: "id" | "mediaId" = "id",
) {
  const resolvedParams = params ? await params : undefined;
  const value = resolvedParams?.[key];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export function sanitizePayload(payload: Record<string, unknown>, allowedKeys: string[]) {
  const sanitized: Record<string, unknown> = {};

  for (const key of allowedKeys) {
    if (key in payload && payload[key] !== undefined) {
      sanitized[key] = payload[key];
    }
  }

  return sanitized;
}

export function assertRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function handleSupabaseError(error: unknown, fallbackCode: string) {
  const errorCode =
    error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : "UNKNOWN";
  console.error(`${fallbackCode}: ${errorCode}`);
  return errorResponse(fallbackCode, "The request could not be completed.", 500);
}
