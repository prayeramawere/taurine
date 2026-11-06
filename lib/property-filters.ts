export type PropertyFilters = {
  location?: string;
  min_price?: number;
  max_price?: number;
  property_type?: string;
  listing_status?: string;
  bedrooms_min?: number;
  limit?: number;
};

function validText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export function parsePropertyFilters(value: unknown): PropertyFilters | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const filters: PropertyFilters = {};

  if (input.location !== undefined) {
    if (!validText(input.location, 150)) return null;
    filters.location = input.location.trim();
  }
  for (const key of ["min_price", "max_price"] as const) {
    const amount = input[key];
    if (amount !== undefined) {
      if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) return null;
      filters[key] = amount;
    }
  }
  if (
    filters.min_price !== undefined &&
    filters.max_price !== undefined &&
    filters.min_price > filters.max_price
  ) return null;

  if (input.property_type !== undefined) {
    if (!validText(input.property_type, 50)) return null;
    filters.property_type = input.property_type.trim();
  }
  if (input.listing_status !== undefined) {
    if (!validText(input.listing_status, 40)) return null;
    filters.listing_status = input.listing_status.trim();
  }
  if (input.bedrooms_min !== undefined) {
    if (typeof input.bedrooms_min !== "number" || !Number.isInteger(input.bedrooms_min) || input.bedrooms_min < 0) {
      return null;
    }
    filters.bedrooms_min = input.bedrooms_min;
  }
  if (input.limit !== undefined) {
    if (typeof input.limit !== "number" || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 10) {
      return null;
    }
    filters.limit = input.limit;
  }
  return filters;
}
