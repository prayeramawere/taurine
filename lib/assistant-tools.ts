import type { LeadInput } from "@/lib/lead-validation";
import { validateLeadInput } from "@/lib/lead-validation";
import { escapeLike, parsePropertyFilters } from "@/lib/property-filters";
import {
  hasExplicitContactConsent,
  hasExplicitUpdatesConsent,
  onlyKeepUserSuppliedFields,
  requestedAction,
  wasContactProvidedByUser,
} from "@/lib/assistant-consent";
import { getSupabaseAdminClient } from "@/lib/supabase";

export type AssistantMessage = {
  role: "user" | "assistant" | "tool";
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  name?: string;
};

const propertySelect =
  "property_id, property_type, location, square_footage, lot_size, bedrooms, bathrooms, year_built, zoning_classification, listing_status, days_on_market, listing_price, virtual_tour_url";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function searchProperties(args: unknown) {
  const filters = parsePropertyFilters(args);
  if (!filters) return { error: "Invalid property search filters." };

  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from("properties")
    .select(propertySelect)
    .order("listing_price", { ascending: true })
    .limit(filters.limit ?? 5);

  if (filters.location) query = query.ilike("location", `%${escapeLike(filters.location)}%`);
  if (filters.min_price !== undefined) query = query.gte("listing_price", filters.min_price);
  if (filters.max_price !== undefined) query = query.lte("listing_price", filters.max_price);
  if (filters.property_type) query = query.ilike("property_type", filters.property_type);
  if (filters.listing_status) query = query.ilike("listing_status", filters.listing_status);
  else query = query.eq("listing_status", "active");
  if (filters.bedrooms_min !== undefined) query = query.gte("bedrooms", filters.bedrooms_min);

  const { data, error } = await query;
  if (error) throw error;
  return {
    properties: data ?? [],
    verified_at: new Date().toISOString(),
    count: data?.length ?? 0,
  };
}

export async function getPropertyDetails(args: unknown) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return { error: "A property_id is required." };
  }
  const propertyId = (args as Record<string, unknown>).property_id;
  if (typeof propertyId !== "string" || !uuidPattern.test(propertyId)) {
    return { error: "property_id must be a valid UUID." };
  }
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("properties")
    .select(propertySelect)
    .eq("property_id", propertyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { error: "The property is not present in the current database and cannot be verified." };
  return { property: data, verified_at: new Date().toISOString() };
}

function parseLeadArgs(args: unknown): Record<string, unknown> | null {
  if (!args || typeof args !== "object" || Array.isArray(args)) return null;
  const input = args as Record<string, unknown>;
  const allowed = [
    "first_name",
    "last_name",
    "phone_number",
    "email",
    "lead_type",
    "budget_min",
    "budget_max",
    "preferred_location",
    "preferred_property_type",
    "bedrooms_required",
    "property_id",
    "notes",
    "consent_to_contact",
  ];
  return Object.fromEntries(Object.entries(input).filter(([key]) => allowed.includes(key)));
}

async function createLead(args: unknown, messages: AssistantMessage[], requestId: string) {
  const rawPayload = parseLeadArgs(args);
  if (!rawPayload) return { success: false, error: "Lead details must be a JSON object." };
  if (typeof rawPayload.email === "string" && !wasContactProvidedByUser("email", rawPayload.email, messages)) {
    return { success: false, error: "The email address must be provided directly by the user." };
  }
  if (typeof rawPayload.phone_number === "string" && !wasContactProvidedByUser("phone_number", rawPayload.phone_number, messages)) {
    return { success: false, error: "The phone number must be provided directly by the user." };
  }
  if (!hasExplicitContactConsent(messages)) {
    return { success: false, error: "The user has not explicitly consented to agency follow-up." };
  }

  const payload = onlyKeepUserSuppliedFields(rawPayload, messages);
  const action = requestedAction(messages);
  const leadInput: Record<string, unknown> = {
    ...payload,
    consent_to_contact: true,
    requested_action: action,
  };
  const validated = validateLeadInput(leadInput, { assistant: true });
  if (!validated.success) return { success: false, error: validated.error };

  const lead = validated.data as LeadInput;
  if (lead.property_id) {
    const existing = await getPropertyDetails({ property_id: lead.property_id });
    if ("error" in existing) {
      return { success: false, error: "The referenced property could not be verified; no lead was saved." };
    }
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("create_or_update_assistant_lead", {
    p_lead: {
      ...lead,
      consent_to_contact: true,
      requested_action: action,
    },
    p_request_id: requestId,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result || typeof result.lead_id !== "string") {
    throw new Error("Lead creation RPC returned an invalid result.");
  }
  return {
    success: true,
    lead_id: result.lead_id,
    was_created: result.was_created,
    notification_recorded: true,
    message: result.was_created
      ? "The enquiry has been saved and the agency has been notified."
      : "The existing enquiry has been updated and the agency has been notified.",
  };
}

async function createPropertyMatchRequest(args: unknown, messages: AssistantMessage[], requestId: string) {
  const rawPayload = parseLeadArgs(args);
  if (!rawPayload) return { success: false, error: "Waitlist details must be a JSON object." };
  if (typeof rawPayload.email === "string" && !wasContactProvidedByUser("email", rawPayload.email, messages)) {
    return { success: false, error: "The email address must be directly provided by the user." };
  }
  if (typeof rawPayload.phone_number === "string" && !wasContactProvidedByUser("phone_number", rawPayload.phone_number, messages)) {
    return { success: false, error: "The phone number must be directly provided by the user." };
  }
  if (!hasExplicitContactConsent(messages)) {
    return { success: false, error: "Explicit consent for agency follow-up is required." };
  }
  if (!hasExplicitUpdatesConsent(messages)) {
    return { success: false, error: "Explicit consent to property-matching updates is required." };
  }

  const payload = onlyKeepUserSuppliedFields(rawPayload, messages);
  const validated = validateLeadInput(
    {
      ...payload,
      consent_to_contact: true,
      consent_to_updates: true,
    },
    { assistant: true },
  );
  if (!validated.success) return { success: false, error: validated.error };

  const lead = validated.data;
  const requestDetails = {
    preferred_location: lead.preferred_location,
    budget_min: lead.budget_min,
    budget_max: lead.budget_max,
    property_type: lead.preferred_property_type,
    bedrooms_required: lead.bedrooms_required,
    additional_requirements: {},
  };
  if (
    !requestDetails.preferred_location &&
    requestDetails.budget_min === undefined &&
    requestDetails.budget_max === undefined &&
    !requestDetails.property_type &&
    requestDetails.bedrooms_required === undefined
  ) {
    return { success: false, error: "At least one property preference is required for the waitlist." };
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("create_assistant_match_request", {
    p_lead: {
      ...lead,
      consent_to_contact: true,
      consent_to_updates: true,
      lead_type: lead.lead_type ?? "buyer",
      notes: "Consented to waitlist/property match updates.",
    },
    p_match: requestDetails,
    p_request_id: requestId,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result || typeof result.request_id !== "string") {
    throw new Error("Property match request RPC returned an invalid result.");
  }
  const { data: matches, error: matchError } = await supabase
    .from("property_matches")
    .select("relevance_score, match_reasons, properties(property_id, property_type, location, listing_status, listing_price, bedrooms, bathrooms, square_footage)")
    .eq("request_id", result.request_id)
    .eq("match_status", "matched")
    .order("relevance_score", { ascending: false })
    .limit(5);
  if (matchError) throw matchError;
  return {
    success: true,
    request_id: result.request_id,
    matches: matches ?? [],
    notification_delivery: "queued only when a contact channel and explicit matching-update consent are present",
    message: "Your property search preferences have been saved to the waitlist.",
  };
}

export async function executeAssistantTool(
  name: string,
  args: unknown,
  messages: AssistantMessage[],
  requestId: string,
) {
  switch (name) {
    case "search_properties":
      return searchProperties(args);
    case "get_property_details":
      return getPropertyDetails(args);
    case "create_lead":
      return createLead(args, messages, requestId);
    case "create_property_match_request":
      return createPropertyMatchRequest(args, messages, requestId);
    default:
      return { error: "This assistant tool is not available." };
  }
}

export const assistantTools = [
  {
    type: "function",
    function: {
      name: "search_properties",
      description: "Search current property listings. Returns only live database records.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          location: { type: "string", maxLength: 150 },
          min_price: { type: "number", minimum: 0 },
          max_price: { type: "number", minimum: 0 },
          property_type: { type: "string", maxLength: 50 },
          listing_status: { type: "string", maxLength: 40 },
          bedrooms_min: { type: "integer", minimum: 0 },
          limit: { type: "integer", minimum: 1, maximum: 10 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_property_details",
      description: "Retrieve current complete public details for a property by its exact ID.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { property_id: { type: "string", format: "uuid" } },
        required: ["property_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_lead",
      description: "Save a prospective client enquiry only after explicit contact consent and only using contact details the user supplied.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          first_name: { type: "string", maxLength: 100 },
          last_name: { type: "string", maxLength: 100 },
          phone_number: { type: "string", maxLength: 30 },
          email: { type: "string", maxLength: 255 },
          lead_type: { type: "string", enum: ["buyer", "seller", "tenant", "landlord", "other"] },
          budget_min: { type: "number", minimum: 0 },
          budget_max: { type: "number", minimum: 0 },
          preferred_location: { type: "string", maxLength: 500 },
          preferred_property_type: { type: "string", maxLength: 50 },
          bedrooms_required: { type: "integer", minimum: 0 },
          property_id: { type: "string", format: "uuid" },
          notes: { type: "string", maxLength: 4000 },
          consent_to_contact: { type: "boolean" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_property_match_request",
      description: "Save property preferences to the waitlist only after the user explicitly consents both to agency contact and to future matching-property updates.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          first_name: { type: "string", maxLength: 100 },
          last_name: { type: "string", maxLength: 100 },
          phone_number: { type: "string", maxLength: 30 },
          email: { type: "string", maxLength: 255 },
          lead_type: { type: "string", enum: ["buyer", "tenant", "other"] },
          budget_min: { type: "number", minimum: 0 },
          budget_max: { type: "number", minimum: 0 },
          preferred_location: { type: "string", maxLength: 500 },
          preferred_property_type: { type: "string", maxLength: 50 },
          bedrooms_required: { type: "integer", minimum: 0 },
        },
      },
    },
  },
] as const;

export function validateAssistantConsentForTest(messages: AssistantMessage[]) {
  return hasExplicitContactConsent(messages);
}
