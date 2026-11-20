// What a person may do with enquiries. The permissions live in the database
// (role_permission_grants), so access follows the roles configured in the app.
// Nothing here hard-codes a role name.

export const ENQUIRY_PERMISSION_KEYS = {
  view: "enquiries.view",
  manage: "enquiries.manage",
  delete: "enquiries.delete",

  /*
   * The three Phase 1's migration added. Each separates a job that happens
   * to be done by the same person in a small showroom and by different
   * people in a large one:
   *
   *   assign  — handing work to somebody else
   *   export  — taking customer contact details out of the system
   *   valuate — putting a number on a member of the public's car
   *
   * Row-level security checks enquiries.manage for writes to the child
   * tables, so these three are application-level gates on top of it, not
   * instead of it. Somebody with manage but not valuate is refused by the
   * action; the database would have let the write through.
   */
  assign: "enquiries.assign",
  export: "enquiries.export",
  valuate: "enquiries.valuate",
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
  assign: "You don't have permission to assign enquiries to other staff.",
  export: "You don't have permission to export enquiries.",
  valuate: "You don't have permission to value vehicles.",
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
