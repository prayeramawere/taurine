export type ProviderToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export function parseProviderToolCalls(value: unknown): ProviderToolCall[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const calls: ProviderToolCall[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const call = item as Record<string, unknown>;
    const fn = call.function;
    if (
      typeof call.id !== "string" ||
      call.id.length === 0 ||
      call.id.length > 128 ||
      call.type !== "function" ||
      !fn ||
      typeof fn !== "object" ||
      Array.isArray(fn) ||
      typeof (fn as Record<string, unknown>).name !== "string" ||
      (fn as Record<string, unknown>).name === "" ||
      typeof (fn as Record<string, unknown>).arguments !== "string"
    ) {
      return null;
    }
    calls.push({
      id: call.id,
      type: "function",
      function: {
        name: (fn as Record<string, string>).name,
        arguments: (fn as Record<string, string>).arguments,
      },
    });
  }
  return calls;
}

export function providerErrorResponse(status: number) {
  if (status === 429) {
    return {
      code: "AI_RATE_LIMITED",
      message: "The assistant is temporarily busy. Please try again shortly.",
      status: 503,
    };
  }
  return {
    code: "AI_PROVIDER_ERROR",
    message: "The assistant could not process the request.",
    status: 503,
  };
}
