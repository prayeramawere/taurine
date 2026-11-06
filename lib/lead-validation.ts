export const leadFields = [
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
  "lead_status",
  "notes",
  "consent_to_contact",
] as const;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const leadTypes = new Set(["buyer", "seller", "tenant", "landlord", "other"]);
const leadStatuses = new Set(["new", "contacted", "qualified", "converted", "closed"]);

export type LeadInput = {
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  email?: string;
  lead_type?: string;
  budget_min?: number;
  budget_max?: number;
  preferred_location?: string;
  preferred_property_type?: string;
  bedrooms_required?: number;
  property_id?: string;
  lead_source?: string;
  lead_status?: string;
  notes?: string;
  consent_to_contact?: boolean;
  consent_to_updates?: boolean;
};

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function optionalText(
  input: Record<string, unknown>,
  key: string,
  maxLength: number,
): ValidationResult<string | undefined> {
  const value = input[key];
  if (value === undefined || value === null || value === "") {
    return { success: true, data: undefined };
  }
  if (typeof value !== "string" || value.trim().length > maxLength) {
    return { success: false, error: `${key} must be a string of at most ${maxLength} characters.` };
  }
  const normalized = value.trim();
  return { success: true, data: normalized || undefined };
}

export function validateLeadInput(
  input: Record<string, unknown>,
  options: { assistant?: boolean; allowLeadStatus?: boolean } = {},
): ValidationResult<LeadInput> {
  const values: LeadInput = {};
  const textFields: Array<[keyof LeadInput, number]> = [
    ["first_name", 100],
    ["last_name", 100],
    ["phone_number", 30],
    ["email", 255],
    ["preferred_location", 500],
    ["preferred_property_type", 50],
    ["notes", 4000],
    ["lead_source", 80],
  ];

  for (const [key, limit] of textFields) {
    const result = optionalText(input, key, limit);
    if (!result.success) return result;
    Object.assign(values, { [key]: result.data });
  }

  if (values.email && !emailPattern.test(values.email)) {
    return { success: false, error: "email must be a valid email address." };
  }

  if (values.phone_number && values.phone_number.replace(/\D/g, "").length < 7) {
    return { success: false, error: "phone_number must contain at least 7 digits." };
  }

  const leadType = input.lead_type;
  if (leadType !== undefined && leadType !== null && leadType !== "") {
    if (typeof leadType !== "string" || !leadTypes.has(leadType)) {
      return { success: false, error: "lead_type must be buyer, seller, tenant, landlord, or other." };
    }
    values.lead_type = leadType;
  }

  for (const key of ["budget_min", "budget_max"] as const) {
    const value = input[key];
    if (value !== undefined && value !== null && value !== "") {
      const number = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(number) || number < 0) {
        return { success: false, error: `${key} must be a non-negative number.` };
      }
      values[key] = number;
    }
  }

  if (
    values.budget_min !== undefined &&
    values.budget_max !== undefined &&
    values.budget_min > values.budget_max
  ) {
    return { success: false, error: "budget_min cannot be greater than budget_max." };
  }

  const bedrooms = input.bedrooms_required;
  if (bedrooms !== undefined && bedrooms !== null && bedrooms !== "") {
    if (!Number.isInteger(bedrooms) || (bedrooms as number) < 0) {
      return { success: false, error: "bedrooms_required must be a non-negative integer." };
    }
    values.bedrooms_required = bedrooms as number;
  }

  if (input.property_id !== undefined && input.property_id !== null && input.property_id !== "") {
    if (typeof input.property_id !== "string" || !uuidPattern.test(input.property_id)) {
      return { success: false, error: "property_id must be a valid UUID." };
    }
    values.property_id = input.property_id;
  }

  if (input.lead_status !== undefined) {
    if (!options.assistant && !options.allowLeadStatus) {
      return { success: false, error: "lead_status cannot be set when creating a lead." };
    }
    if (typeof input.lead_status !== "string" || !leadStatuses.has(input.lead_status)) {
      return { success: false, error: "lead_status is not valid." };
    }
    values.lead_status = input.lead_status;
  }

  for (const key of ["consent_to_contact", "consent_to_updates"] as const) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== "boolean") {
        return { success: false, error: `${key} must be a boolean.` };
      }
      values[key] = input[key];
    }
  }

  if (options.assistant) {
    if (!values.email && !values.phone_number) {
      return { success: false, error: "A valid email address or phone number is required." };
    }
    if (values.consent_to_contact !== true) {
      return { success: false, error: "Explicit consent to contact is required before saving a lead." };
    }
  }

  return { success: true, data: values };
}
