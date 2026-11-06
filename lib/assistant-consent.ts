export type ConversationMessage = {
  role: string;
  content?: string | null;
};

export function hasExplicitContactConsent(messages: ConversationMessage[]) {
  let consentGranted = false;
  let assistantAskedConsent = false;
  for (const message of messages) {
    if (message.role === "assistant") {
      assistantAskedConsent =
        /\b(consent|permission|may we contact|can we contact|follow up)\b/i.test(message.content ?? "");
      continue;
    }
    if (message.role !== "user") continue;
    const userText = message.content ?? "";
    if (/\b(do not|don't|stop|no longer|withdraw)\b.{0,40}\b(contact|call|email|text|follow up)\b/i.test(userText)) {
      consentGranted = false;
    } else if (
      /\b(i consent|i agree to be contacted|you may contact me|you can contact me|please contact me|yes,?\s*(?:you may|you can|please)|i give permission)\b/i.test(
        userText,
      ) ||
      (assistantAskedConsent && /^(yes|yeah|yep|sure|okay|ok|i agree|i consent)[.! ]*$/i.test(userText.trim()))
    ) {
      consentGranted = true;
    }
    assistantAskedConsent = false;
  }
  return consentGranted;
}

export function hasExplicitUpdatesConsent(messages: ConversationMessage[]) {
  let consentGranted = false;
  let assistantAsked = false;
  for (const message of messages) {
    if (message.role === "assistant") {
      assistantAsked =
        /\b(waitlist|matching properties|property alerts|notify you|notifications about properties|updates about listings)\b/i.test(
          message.content ?? "",
        );
      continue;
    }
    if (message.role !== "user") continue;
    const text = message.content ?? "";
    if (/\b(stop|cancel|withdraw|don't|do not)\b.{0,50}\b(alerts|updates|notifications|waitlist|contact)\b/i.test(text)) {
      consentGranted = false;
    } else if (
      /\b(notify me|let me know|send me (?:matching )?properties|keep me updated|add me to the waitlist|save my requirements)\b/i.test(
        text,
      ) ||
      (assistantAsked && /^(yes|yeah|yep|sure|okay|ok|please do|i agree)[.! ]*$/i.test(text.trim()))
    ) {
      consentGranted = true;
    }
    assistantAsked = false;
  }
  return consentGranted;
}

export function wasContactProvidedByUser(
  field: "email" | "phone_number",
  value: string,
  messages: ConversationMessage[],
) {
  const userText = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content ?? "")
    .join("\n");
  if (field === "email") {
    const providedEmails = userText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
    return providedEmails.some((email) => email.toLowerCase() === value.toLowerCase());
  }
  const digits = value.replace(/\D/g, "");
  const providedPhones = userText.match(/\+?\d[\d\s().-]{5,}\d/g) ?? [];
  return digits.length >= 7 && providedPhones.some((phone) => phone.replace(/\D/g, "") === digits);
}

export function requestedAction(messages: ConversationMessage[]): "viewing" | "callback" | "none" {
  const text = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content ?? "")
    .join("\n");
  if (/\b(schedule|book|arrange|request|set up)\b.{0,50}\b(viewing|showing|tour)\b|\b(viewing|showing|tour)\b.{0,50}\b(please|request|schedule|book|arrange)\b|\b(i(?:'d| would) like|i want|can i|could i)\b.{0,60}\b(see|view|visit|tour)\b/i.test(text)) {
    return "viewing";
  }
  if (/\b(call me|callback|call back|phone me|please call)\b/i.test(text)) {
    return "callback";
  }
  return "none";
}

export function onlyKeepUserSuppliedFields(
  payload: Record<string, unknown>,
  messages: ConversationMessage[],
) {
  const userText = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content ?? "")
    .join("\n")
    .toLowerCase();
  const verified = { ...payload };
  for (const key of [
    "first_name",
    "last_name",
    "preferred_location",
    "preferred_property_type",
    "notes",
  ]) {
    const value = verified[key];
    if (typeof value === "string" && !userText.includes(value.toLowerCase())) {
      delete verified[key];
    }
  }
  const leadType = verified.lead_type;
  if (typeof leadType === "string") {
    const phrases: Record<string, string[]> = {
      buyer: ["buy", "buyer", "purchase"],
      seller: ["sell", "seller", "selling"],
      tenant: ["rent", "tenant", "lease"],
      landlord: ["landlord", "rent out", "rental property"],
      other: ["other"],
    };
    if (!phrases[leadType]?.some((phrase) => userText.includes(phrase))) delete verified.lead_type;
  }
  for (const key of ["budget_min", "budget_max", "bedrooms_required"] as const) {
    const value = verified[key];
    if (typeof value === "number") {
      const numberText = String(value);
      const isUserProvided = key === "bedrooms_required"
        ? new RegExp(`\\b${numberText}\\s*(?:bed(?:room)?s?|br)\\b`, "i").test(userText)
        : userText.replace(/[,$\s]/g, "").includes(numberText);
      if (!isUserProvided) delete verified[key];
    }
  }
  return verified;
}
