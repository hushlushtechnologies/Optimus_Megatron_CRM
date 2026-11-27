/*
|--------------------------------------------------------------------------
| THE REPORTS WORKSPACE
|--------------------------------------------------------------------------
|
| One registry of report sections: what each is called, where it lives, what
| it needs to be opened, and which batch it arrives in.
|
| WHY A REGISTRY RATHER THAN A HARDCODED NAV
|
| Eleven report domains land across four batches. A registry means adding one
| is a single entry here rather than an edit in the navigation, another in the
| permission layer and a third in the export route — three places that drift.
|
| HOW ACCESS WORKS, AND WHY IT IS NOT WHAT WAS PLANNED
|
| The agreed approach was "per-dataset gating on the module keys that already
| exist". That holds for seven of the domains. It cannot hold for three,
| because those modules have no read permission keys at all:
|
|   sales, reservations, payments, test_drives, enquiries, offers, loyalty
|       → real keys in app_permissions, checked via get_my_permissions()
|
|   inventory, customers, leads
|       → no keys. Those modules authorise with hardcoded role-name lists
|         (INVENTORY_MANAGER_ROLES, CUSTOMER_MANAGER_ROLES, ELEVATED_LEAD_ROLES)
|         and only on mutations. Their list pages do not gate reads at all.
|
| So inventing `inventory.view` here would create a key nothing else in the
| application honours, while the Inventory page itself stayed open — a
| conflicting permission, which the sprint plan forbids. Those three sections
| therefore require only a signed-in user, matching the pages they summarise.
|
| What protects the sensitive part instead is `reports.financial`: a single
| new key, as agreed, that gates every money figure in every section. A person
| can see that 14 cars sold without seeing what they sold for.
|
| The read-permission gap in inventory, customers and leads is a real finding
| and belongs to Sprint 11 (Users, Staff & Roles), not here. It is written up
| in the Phase 1 audit.
*/

export type ReportSectionId =
  | "overview"
  | "sales"
  | "inventory"
  | "customers"
  | "operations"
  | "staff"
  | "payments"
  | "promotions";

/** Which batch a section arrives in. Only "ready" sections appear in the nav. */
export type SectionStatus = "ready" | "planned";

export interface ReportSection {
  id: ReportSectionId;
  label: string;
  /**
   * A shorter label for the navigation row, where eight tabs compete for
   * width. Measured: with the full labels the row needs 1,019px, so it
   * scrolls on a 1280px screen once the sidebar is accounted for. The full
   * label is still used for page titles, breadcrumbs and export headers,
   * where there is room and the longer name is clearer.
   */
  navLabel?: string;
  href: string;
  /** Shown under the page title. */
  description: string;
  /**
   * Permission keys, ANY of which opens the section.
   *
   * Empty means "any signed-in user" — used only where the module being
   * reported on has no read key of its own. See the header.
   */
  anyOf: readonly string[];
  status: SectionStatus;
}

export const REPORT_SECTIONS: readonly ReportSection[] = [
  {
    id: "overview",
    label: "Overview",
    href: "/admin/reports",
    description: "How the business is performing across sales, operations and collections.",
    anyOf: [],
    status: "ready",
  },
  {
    id: "sales",
    label: "Sales",
    href: "/admin/reports/sales",
    description: "Deals created, completed and cancelled, with values and collections.",
    anyOf: ["sales.view"],
    status: "ready",
  },
  {
    id: "inventory",
    label: "Inventory",
    href: "/admin/reports/inventory",
    description: "Stock levels, ageing and what is selling.",
    anyOf: [],
    status: "ready",
  },
  {
    id: "customers",
    label: "Customers & Leads",
    navLabel: "Customers",
    href: "/admin/reports/customers",
    description: "Who is buying, where they came from, and how leads are progressing.",
    anyOf: [],
    status: "ready",
  },
  {
    id: "operations",
    label: "Operations",
    href: "/admin/reports/operations",
    description: "Test drives, reservations and enquiries.",
    anyOf: ["test_drives.export", "reservations.view", "enquiries.view"],
    status: "ready",
  },
  {
    id: "staff",
    label: "Staff",
    href: "/admin/reports/staff",
    description: "Workload and outcomes by the person actually assigned.",
    anyOf: ["sales.view_all"],
    status: "ready",
  },
  {
    id: "payments",
    label: "Payments",
    href: "/admin/reports/payments",
    description: "Verification, collections, refunds and reconciliation.",
    anyOf: ["payments.verify", "payments.reverse", "payments.record"],
    status: "ready",
  },
  {
    id: "promotions",
    label: "Promotions & Loyalty",
    navLabel: "Promotions",
    href: "/admin/reports/promotions",
    description: "Campaign take-up, discounts given and points movement.",
    anyOf: ["offers.view", "loyalty.view"],
    status: "ready",
  },
];

/** The one new key this sprint adds. Gates every money figure, everywhere. */
export const REPORTS_FINANCIAL_KEY = "reports.financial";

export function findReportSection(id: string): ReportSection | undefined {
  return REPORT_SECTIONS.find((section) => section.id === id);
}

/** Sections built so far. The nav shows these and no others. */
export function readySections(): readonly ReportSection[] {
  return REPORT_SECTIONS.filter((section) => section.status === "ready");
}
