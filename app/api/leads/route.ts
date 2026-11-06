import { randomUUID } from "node:crypto";
import { requireStaff, staffHasPermission } from "@/lib/staff-auth";
import { validateLeadInput } from "@/lib/lead-validation";
import { errorResponse, okResponse } from "@/lib/supabase";

const allowedCreateFields = new Set([
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
  "lead_source",
  "notes",
  "consent_to_contact",
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const auth = await requireStaff(request);
  if (!auth.authorized) return auth.response;
  const canSeeAll = auth.staff.isAdmin || staffHasPermission(auth.staff, "leads:read");
  if (!canSeeAll && !staffHasPermission(auth.staff, "leads:assigned:read")) {
    return errorResponse("FORBIDDEN", "Your staff role cannot view leads.", 403);
  }

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "25");
  const sort = url.searchParams.get("sort") ?? "created_at";
  const order = url.searchParams.get("order") ?? "desc";
  const leadStatus = url.searchParams.get("lead_status");
  const leadType = url.searchParams.get("lead_type");
  const propertyId = url.searchParams.get("property_id");
  const leadStatuses = new Set(["new", "contacted", "qualified", "converted", "closed"]);
  const leadTypes = new Set(["buyer", "seller", "tenant", "landlord", "other"]);
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    !["created_at", "updated_at", "lead_status"].includes(sort) ||
    !["asc", "desc"].includes(order) ||
    (propertyId !== null && !uuidPattern.test(propertyId)) ||
    (leadStatus !== null && !leadStatuses.has(leadStatus)) ||
    (leadType !== null && !leadTypes.has(leadType))
  ) {
    return errorResponse("LEAD_QUERY_INVALID", "Pagination, sorting, or filter parameters are invalid.", 400);
  }

  try {
    let query = auth.staff.supabase
      .from("leads")
      .select("*", { count: "exact" })
      .order(sort, { ascending: order === "asc" })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (!canSeeAll) query = query.eq("assigned_staff_id", auth.staff.staffId);
    if (leadStatus) query = query.eq("lead_status", leadStatus);
    if (leadType) query = query.eq("lead_type", leadType);
    if (propertyId) query = query.eq("property_id", propertyId);

    const { data, error, count } = await query;
    if (error) throw error;
    return okResponse({
      items: data ?? [],
      pagination: {
        page,
        pageSize,
        totalItems: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      },
    });
  } catch {
    console.error("LEAD_LIST_FAILED");
    return errorResponse("LEAD_LIST_FAILED", "Leads could not be retrieved.", 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireStaff(request, "leads:create");
  if (!auth.authorized) return auth.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse("LEAD_VALIDATION_ERROR", "Request body must contain valid JSON.", 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return errorResponse("LEAD_VALIDATION_ERROR", "Request body must be a JSON object.", 400);
  }

  const input = payload as Record<string, unknown>;
  const unknownFields = Object.keys(input).filter((field) => !allowedCreateFields.has(field));
  if (unknownFields.length) {
    return errorResponse("LEAD_VALIDATION_ERROR", `Unsupported lead fields: ${unknownFields.join(", ")}`, 400);
  }
  const validated = validateLeadInput(input);
  if (!validated.success) {
    return errorResponse("LEAD_VALIDATION_ERROR", validated.error, 400);
  }
  if (!validated.data.email && !validated.data.phone_number) {
    return errorResponse("LEAD_VALIDATION_ERROR", "An email address or phone number is required.", 400);
  }

  const headerRequestId = request.headers.get("idempotency-key");
  if (headerRequestId && !uuidPattern.test(headerRequestId)) {
    return errorResponse("IDEMPOTENCY_KEY_INVALID", "Idempotency-Key must be a UUID.", 400);
  }
  const requestId = headerRequestId ?? randomUUID();

  try {
    const { data, error } = await auth.staff.supabase.rpc("create_or_update_assistant_lead", {
      p_lead: {
        ...validated.data,
        lead_source: validated.data.lead_source ?? "agency API",
        requested_action: "none",
      },
      p_request_id: requestId,
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result || typeof result.lead_id !== "string") throw new Error("Invalid lead operation result.");
    return okResponse(
      { lead: result, notification_recorded: true },
      result.was_created ? 201 : 200,
    );
  } catch (error) {
    const errorCode =
      error && typeof error === "object" && "code" in error && error.code === "23505";
    if (errorCode) {
      return errorResponse("LEAD_CONTACT_CONFLICT", "The contact details conflict with another lead.", 409);
    }
    console.error("LEAD_CREATE_FAILED");
    return errorResponse("LEAD_CREATE_FAILED", "The lead could not be saved.", 500);
  }
}
