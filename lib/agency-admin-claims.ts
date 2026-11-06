export function hasAgencyAdminClaim(
  appMetadata: unknown,
  permission?: string,
): boolean {
  if (!appMetadata || typeof appMetadata !== "object" || Array.isArray(appMetadata)) {
    return false;
  }
  const metadata = appMetadata as Record<string, unknown>;
  if (metadata.agency_role !== "admin") return false;
  if (permission === undefined) return true;
  return Array.isArray(metadata.agency_permissions) && metadata.agency_permissions.includes(permission);
}
