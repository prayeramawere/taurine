import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

function getSessionSecret() {
  const secret = process.env.ASSISTANT_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ASSISTANT_SESSION_SECRET must contain at least 32 characters.");
  }
  return secret;
}

function sign(sessionId: string) {
  return createHmac("sha256", getSessionSecret()).update(sessionId).digest("base64url");
}

export function createAssistantSession() {
  const sessionId = randomUUID();
  return {
    sessionId,
    sessionToken: `${sessionId}.${sign(sessionId)}`,
  };
}

export function verifyAssistantSession(token: unknown): string | null {
  if (typeof token !== "string") return null;
  const [sessionId, signature, extra] = token.split(".");
  if (
    extra !== undefined ||
    !sessionId ||
    !signature ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)
  ) {
    return null;
  }
  try {
    const expected = Buffer.from(sign(sessionId));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual) ? sessionId : null;
  } catch {
    return null;
  }
}
