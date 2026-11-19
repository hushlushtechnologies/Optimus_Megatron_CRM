// What a person may do with enquiries. The permissions live in the database
// (role_permission_grants), so access follows the roles configured in the app.
// Nothing here hard-codes a role name.

export const ENQUIRY_PERMISSION_KEYS = {
  view: "enquiries.view",
  manage: "enquiries.manage",
  delete: "enquiries.delete",
} as const;

export type EnquiryPermissionName = keyof typeof ENQUIRY_PERMISSION_KEYS;
export type EnquiryPermissions = Record<EnquiryPermissionName, boolean>;

const NAMES = Object.keys(ENQUIRY_PERMISSION_KEYS) as EnquiryPermissionName[];

export const NO_ENQUIRY_PERMISSIONS: EnquiryPermissions = Object.fromEntries(
  NAMES.map((name) => [name, false]),
) as EnquiryPermissions;

export const ENQUIRY_PERMISSION_MESSAGES: Record<EnquiryPermissionName, string> = {
  view: "You don't have permission to view enquiries.",
  manage: "You don't have permission to work on enquiries.",
  delete: "You don't have permission to delete enquiries.",
};

export function toEnquiryPermissions(keys: readonly string[]): EnquiryPermissions {
  const granted = new Set(keys);

  return Object.fromEntries(
    NAMES.map((name) => [name, granted.has(ENQUIRY_PERMISSION_KEYS[name])]),
  ) as EnquiryPermissions;
}

export function hasAnyEnquiryPermission(permissions: EnquiryPermissions): boolean {
  return Object.values(permissions).some(Boolean);
}
