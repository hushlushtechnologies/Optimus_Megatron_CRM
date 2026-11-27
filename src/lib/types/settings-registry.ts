import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Building2,
  CalendarClock,
  Car,
  CreditCard,
  FileClock,
  Gift,
  Globe2,
  Handshake,
  HeartHandshake,
  Image as ImageIcon,
  Layers,
  MailQuestion,
  MapPin,
  Monitor,
  Palette,
  Plug,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  Users,
} from "lucide-react";

/*
|--------------------------------------------------------------------------
| THE SETTINGS REGISTRY (Sprint 10, Phase 2)
|--------------------------------------------------------------------------
|
| One list describing every settings page: where it lives, what it is for,
| which words should find it, which permission opens it, and whether it
| exists yet.
|
| WHY ONE LIST
|
| The brief asks for navigation, search, breadcrumbs and permission gating,
| and all four are the same question asked differently: "which settings
| pages are there, and may this person see them?" Answering it in four
| places means four places to forget when a page is added.
|
| Sprint 9 built REPORT_SECTIONS on exactly this shape and it drove the
| report navigation, the page titles, the permission checks and the export
| route from one source. This is the same pattern with two additions that
| settings needs: `keywords` for search, and a `category` level above the
| page, because there are five groups of these rather than one row of tabs.
|
| HONESTY ABOUT WHAT EXISTS
|
| `status` is the important field.
|
|   "ready"    the page exists and does something
|   "planned"  the page is in the information architecture but has no
|              implementation yet
|
| A "planned" entry is shown, greyed, with the reason — rather than linking
| to a 404 or, worse, to a page of controls that look real and save nothing.
| The brief is explicit about this ("Do not create fake settings controls
| simply to fill every category") and the sidebar already has the same
| convention in src/config/nav.ts, where modules are "live" or "soon".
|
| Never set a page to "ready" before its route exists. The test asserts it.
*/

export type SettingsCategoryId =
  | "organization"
  | "operations"
  | "marketing"
  | "communications"
  | "system";

export type SettingsStatus = "ready" | "planned";

export interface SettingsPage {
  /** Unique across the whole registry, not just its category. */
  id: string;
  category: SettingsCategoryId;
  label: string;
  /** One line, shown under the page title and on the overview card. */
  description: string;
  href: string;
  icon: LucideIcon;
  /**
   * Extra words that should find this page in search.
   *
   * The label and description are already searched, so these are for the
   * terms somebody would actually type that do not appear in either —
   * "deposit" for Reservations, "TRN" for Company, "expiry" for Loyalty.
   * The brief's own examples drove the first set of these.
   */
  keywords: readonly string[];
  /**
   * Permission keys, ANY of which opens the page for reading.
   *
   * Editing is a separate question and a separate key — see
   * settings-permissions.ts. A sales manager may need to see what the
   * discount threshold is without being able to move it.
   *
   * Empty means any signed-in user, used only for personal preferences
   * like Appearance, which are nobody else's business.
   *
   * ONLY KEYS THAT ACTUALLY EXIST
   *
   * This codebase has two authorisation systems. Sales, reservations,
   * payments, test drives, enquiries, offers and loyalty use permission
   * keys through get_my_permissions(). Inventory, customers and leads use
   * hardcoded role-name arrays — INVENTORY_MANAGER_ROLES,
   * CUSTOMER_MANAGER_ROLES, ELEVATED_LEAD_ROLES — and have no keys at all.
   *
   * So `inventory.view`, `customers.view` and `leads.view` do not exist.
   * I used them here anyway, and checks/check-permission-keys.py caught it:
   * a key nobody can hold means a page nobody can ever open, and the
   * failure is silent because an empty permission set is indistinguishable
   * from a permission correctly withheld.
   *
   * Those three pages are gated on settings.operations instead — a real key
   * that sql/12 defines. That is stricter rather than looser: it needs the
   * category key rather than mere module access. Unifying the two systems
   * belongs to Sprint 11, which is the roles and permissions sprint.
   */
  anyOf: readonly string[];
  status: SettingsStatus;
  /** Why a planned page is not available yet. Required when planned. */
  note?: string;
  /** The module this configures, linked from the page as "go to the module". */
  moduleHref?: string;
}

export interface SettingsCategory {
  id: SettingsCategoryId;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const SETTINGS_CATEGORIES: readonly SettingsCategory[] = [
  {
    id: "organization",
    label: "Organization & General",
    description: "Who the business is, where it operates from, and the regional basics.",
    icon: Building2,
  },
  {
    id: "operations",
    label: "Business Operations",
    description:
      "How each module behaves — inventory, customers, bookings, sales, payments and reports.",
    icon: SlidersHorizontal,
  },
  {
    id: "marketing",
    label: "Marketing & Loyalty",
    description: "Promotion policy, the loyalty programme and customer segments.",
    icon: Gift,
  },
  {
    id: "communications",
    label: "Notifications & Communications",
    description: "Who gets told what, when reminders run, and which channels are connected.",
    icon: Bell,
  },
  {
    id: "system",
    label: "System & Administration",
    description: "Appearance, access, system state and the record of configuration changes.",
    icon: Monitor,
  },
];

export const SETTINGS_PAGES: readonly SettingsPage[] = [
  /* ---------------------------------------------------------------- 01 */
  {
    id: "company",
    category: "organization",
    label: "Company Profile",
    description:
      "The legal and trading details that appear on quotations, invoices and receipts.",
    href: "/admin/settings/organization/company",
    icon: Building2,
    keywords: ["legal name", "trading name", "address", "trn", "vat number", "invoice header", "contact"],
    anyOf: ["settings.organization", "sales.settings"],
    status: "ready",
  },
  {
    id: "branding",
    category: "organization",
    label: "Branding & Identity",
    description: "Where each logo file is used, and what branding can safely become a setting.",
    href: "/admin/settings/organization/branding",
    icon: ImageIcon,
    keywords: ["logo", "identity", "letterhead", "document header"],
    anyOf: ["settings.organization", "sales.settings"],
    status: "ready",
  },
  {
    id: "locations",
    category: "organization",
    label: "Showrooms & Locations",
    description: "The showrooms vehicles, test drives and reservations are assigned to.",
    href: "/admin/settings/organization/locations",
    icon: MapPin,
    keywords: ["showroom", "branch", "dubai", "abu dhabi", "sharjah", "location"],
    anyOf: ["settings.organization", "sales.settings"],
    status: "ready",
  },
  {
    id: "regional",
    category: "organization",
    label: "Regional Preferences",
    description: "Currency, timezone, date format and language. All fixed for the business.",
    href: "/admin/settings/organization/regional",
    icon: Globe2,
    keywords: ["currency", "aed", "timezone", "dubai", "date format", "language"],
    anyOf: [],
    status: "ready",
  },

  /* ---------------------------------------------------------------- 02 */
  {
    id: "inventory",
    category: "operations",
    label: "Inventory",
    description: "Body types, fuel, transmission, drive, paint finishes and warranty types.",
    href: "/admin/settings/operations/inventory",
    icon: Car,
    keywords: ["body type", "fuel", "petrol", "transmission", "drive", "paint", "colour", "warranty", "lookup"],
    /* inventory.view does not exist — see the anyOf note above. */
    anyOf: ["settings.operations"],
    status: "ready",
    moduleHref: "/admin/inventory",
  },
  {
    id: "crm",
    category: "operations",
    label: "Customers & Leads",
    description: "Customer sources and tags, lead stages, tags and lost reasons.",
    href: "/admin/settings/operations/crm",
    icon: Users,
    keywords: ["source", "instagram", "walk-in", "referral", "tag", "stage", "pipeline", "lost reason"],
    /* customers.view and leads.view do not exist — see the anyOf note. */
    anyOf: ["settings.operations"],
    status: "ready",
    moduleHref: "/admin/leads",
  },
  {
    id: "test-drives",
    category: "operations",
    label: "Test Drives",
    description: "Showroom hours, slot length, buffers and reminder timing.",
    href: "/admin/settings/operations/test-drives",
    icon: CalendarClock,
    keywords: ["slot", "duration", "buffer", "hours", "availability", "reminder", "booking"],
    anyOf: ["test_drives.settings", "test_drives.create"],
    status: "ready",
    moduleHref: "/admin/test-drives",
  },
  {
    id: "reservations",
    category: "operations",
    label: "Reservations",
    description: "Default and maximum hold duration, and the deposit rules.",
    href: "/admin/settings/operations/reservations",
    icon: Timer,
    keywords: ["deposit", "hold", "duration", "token", "expiry", "reservation"],
    anyOf: ["settings.operations", "sales.settings"],
    status: "ready",
    moduleHref: "/admin/reservations",
  },
  {
    id: "enquiries",
    category: "operations",
    label: "Enquiries",
    description: "Enquiry types, sources, statuses and follow-up defaults.",
    href: "/admin/settings/operations/enquiries",
    icon: MailQuestion,
    keywords: ["enquiry", "type", "source", "status", "priority", "follow-up", "valuation"],
    anyOf: ["settings.operations", "enquiries.view"],
    status: "ready",
    moduleHref: "/admin/enquiries",
  },
  {
    id: "sales",
    category: "operations",
    label: "Sales & Pricing",
    description: "Discounts, approval thresholds, fees, tax, documents and delivery checklists.",
    href: "/admin/settings/operations/sales",
    icon: Handshake,
    keywords: ["discount", "approval", "threshold", "fee", "vat", "tax", "numbering", "delivery", "checklist", "pricing"],
    anyOf: ["settings.operations", "sales.settings"],
    status: "ready",
    moduleHref: "/admin/sales",
  },
  {
    id: "payments",
    category: "operations",
    label: "Payments",
    description: "The deposit needed to confirm a deal, and who may verify a payment.",
    href: "/admin/settings/operations/payments",
    icon: CreditCard,
    keywords: ["verifier", "separate", "verification", "method", "cash", "cheque", "refund", "reconciliation", "deposit"],
    anyOf: ["settings.operations", "payments.verify", "sales.settings"],
    status: "ready",
    moduleHref: "/admin/sales/payments",
  },
  {
    id: "reports",
    category: "operations",
    label: "Reports & Exports",
    description: "Default reporting period and export preferences. Display only.",
    href: "/admin/settings/operations/reports",
    icon: Layers,
    keywords: ["report", "period", "export", "excel", "pdf", "default view"],
    anyOf: [],
    status: "planned",
    note: "These are personal display preferences, not company figures — the definitions behind the numbers stay in code. No storage for them exists yet.",
    moduleHref: "/admin/reports",
  },

  /* ---------------------------------------------------------------- 03 */
  {
    id: "offers",
    category: "marketing",
    label: "Offers & Promotions",
    description: "Campaign defaults and redemption policy.",
    href: "/admin/settings/marketing/offers",
    icon: Gift,
    keywords: ["promotion", "campaign", "discount", "stacking", "code", "redemption", "eligibility"],
    anyOf: ["offers.view"],
    status: "planned",
    note: "There is no promotions settings table — every policy is set per campaign today. Which of these the redemption engine could honour needs establishing before a control is shown.",
    moduleHref: "/admin/offers",
  },
  {
    id: "loyalty",
    category: "marketing",
    label: "Loyalty Points",
    description: "Earning, redemption, expiry and the refund reversal policy.",
    href: "/admin/settings/marketing/loyalty",
    icon: HeartHandshake,
    keywords: ["points", "earn", "redeem", "conversion", "expiry", "multiplier", "wallet", "reversal"],
    anyOf: ["loyalty.view", "loyalty.settings"],
    status: "ready",
    moduleHref: "/admin/offers",
  },
  {
    id: "segments",
    category: "marketing",
    label: "Customer Segments",
    description: "The tags and relationships campaigns target.",
    href: "/admin/settings/marketing/segments",
    icon: Users,
    keywords: ["segment", "tag", "audience", "targeting", "eligibility"],
    /* customers.view does not exist — see the anyOf note above. */
    anyOf: ["settings.marketing"],
    status: "planned",
    note: "Segments reuse customer_tags and promotion eligibility rules rather than a second engine. The surface for managing them is not built yet.",
  },

  /* ---------------------------------------------------------------- 04 */
  {
    id: "notifications",
    category: "communications",
    label: "Notification Preferences",
    description: "Which events reach you, and which are required for everyone.",
    href: "/admin/settings/communications/notifications",
    icon: Bell,
    keywords: ["notification", "preference", "alert", "assigned", "reminder", "mute", "unsubscribe"],
    /*
     * anyOf stays empty: these are a person's OWN preferences, so anybody
     * signed in may open the page. The RLS policies in sql/15 restrict every
     * row to its owner, and mandatory groups cannot be switched off by
     * anybody at all.
     */
    anyOf: [],
    status: "ready",
    moduleHref: "/admin/notifications",
  },
  {
    id: "rules",
    category: "communications",
    label: "Notification Rules",
    description: "Company-wide rules for who is told about what.",
    href: "/admin/settings/communications/rules",
    icon: ScrollText,
    keywords: ["rule", "routing", "recipient", "mandatory", "escalation"],
    anyOf: ["settings.communications"],
    status: "planned",
    note: "Depends on the preference storage above.",
  },
  {
    id: "reminders",
    category: "communications",
    label: "Scheduled Reminders",
    description: "The four background jobs, when each last ran, and what is waiting for the next run.",
    href: "/admin/settings/communications/reminders",
    icon: FileClock,
    keywords: ["scheduled", "reminder", "job", "cron", "expiry", "sweep", "background"],
    /*
     * settings.system is here as well as settings.communications because the
     * page reports on loyalty and campaign maintenance. Opening it to read
     * the history is a communications matter; running a points-expiry
     * backlog is not, and that button checks settings.system separately.
     */
    anyOf: ["settings.communications", "settings.system"],
    status: "ready",
  },
  {
    id: "integrations",
    category: "communications",
    label: "Channels & Integrations",
    description: "Email and messaging providers. Notifications are in-app only today.",
    href: "/admin/settings/communications/integrations",
    icon: Plug,
    keywords: ["email", "whatsapp", "sms", "provider", "channel", "integration", "sender"],
    anyOf: ["settings.communications"],
    status: "planned",
    note: "No email or messaging provider is connected. The page will say so plainly rather than show channels that cannot deliver.",
  },

  /* ---------------------------------------------------------------- 05 */
  {
    id: "appearance",
    category: "system",
    label: "Appearance",
    description: "Theme and display density. Yours alone, not the company's.",
    href: "/admin/settings/system/appearance",
    icon: Palette,
    keywords: ["theme", "dark", "light", "density", "motion", "contrast", "display"],
    anyOf: [],
    status: "ready",
  },
  {
    id: "security",
    category: "system",
    label: "Security & Access",
    description: "What the access rules currently are. Read-only.",
    href: "/admin/settings/system/security",
    icon: ShieldCheck,
    keywords: ["security", "session", "access", "permission", "role", "rls"],
    anyOf: ["settings.system"],
    status: "ready",
  },
  {
    id: "health",
    category: "system",
    label: "System Health",
    description: "Whether the scheduled jobs and integrations are running.",
    href: "/admin/settings/system/health",
    icon: Monitor,
    keywords: ["health", "status", "uptime", "job", "failure", "monitoring"],
    anyOf: ["settings.system"],
    status: "ready",
  },
  {
    id: "history",
    category: "system",
    label: "Configuration History",
    description: "Who changed which setting, and when.",
    href: "/admin/settings/system/history",
    icon: FileClock,
    keywords: ["history", "audit", "change", "who changed", "previous value", "log"],
    anyOf: ["settings.system", "sales.settings"],
    status: "ready",
  },
];

/* ---------------------------------------------------------------------- */

export const SETTINGS_ROOT = "/admin/settings";

/** Category keys introduced by Sprint 10. See sql/12. */
export const SETTINGS_EDIT_KEYS = {
  organization: "settings.organization",
  operations: "settings.operations",
  marketing: "settings.marketing",
  communications: "settings.communications",
  system: "settings.system",
} as const satisfies Record<SettingsCategoryId, string>;

export function findSettingsPage(id: string): SettingsPage | undefined {
  return SETTINGS_PAGES.find((page) => page.id === id);
}

export function findSettingsPageByHref(pathname: string): SettingsPage | undefined {
  /* Exact match first, then the longest prefix, so a nested route still
     resolves to its page rather than to whichever entry happens to be a
     shorter prefix of it. */
  const exact = SETTINGS_PAGES.find((page) => page.href === pathname);
  if (exact) return exact;

  return SETTINGS_PAGES.filter((page) => pathname.startsWith(`${page.href}/`)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
}

export function findSettingsCategory(id: string): SettingsCategory | undefined {
  return SETTINGS_CATEGORIES.find((category) => category.id === id);
}

export function pagesInCategory(id: SettingsCategoryId): readonly SettingsPage[] {
  return SETTINGS_PAGES.filter((page) => page.category === id);
}

/**
 * Pages matching a search term, best match first.
 *
 * TOKENISED, NOT SUBSTRING
 *
 * The first version matched the whole phrase as one substring, and two of
 * the brief's three examples found nothing: "Reservation deposit" appears
 * nowhere as a literal string, because "reservation" is in the label and
 * "deposit" is in the keywords. "Loyalty points" only worked by luck — it
 * happens to be a label verbatim.
 *
 * So the term is split into words and every word has to match something.
 * ALL rather than ANY, deliberately: "reservation deposit" should find the
 * page about both, not every page mentioning either. Requiring all of them
 * is what makes a two-word search narrower than a one-word search, which is
 * what somebody typing a second word is asking for.
 *
 * Ranked rather than filtered, because "deposit" should put Reservations
 * above anything that merely mentions the word in passing. A label match
 * outranks a keyword match, which outranks a description match — roughly
 * the order in which somebody's typing tends to mean what they meant.
 */
export function searchSettings(term: string): readonly SettingsPage[] {
  const tokens = term
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);

  if (tokens.length === 0) return [];

  const scored = SETTINGS_PAGES.map((page) => {
    const label = page.label.toLowerCase();
    const description = page.description.toLowerCase();
    const keywords = page.keywords.map((keyword) => keyword.toLowerCase());
    const category = findSettingsCategory(page.category)?.label.toLowerCase() ?? "";

    let total = 0;

    for (const token of tokens) {
      let best = 0;

      if (label === token) best = 100;
      else if (label.startsWith(token)) best = 80;
      else if (label.includes(token)) best = 60;

      if (best === 0 && keywords.some((keyword) => keyword.includes(token))) best = 40;
      if (best === 0 && description.includes(token)) best = 20;
      if (best === 0 && category.includes(token)) best = 10;

      /* One unmatched word disqualifies the page. */
      if (best === 0) return { page, score: 0 };

      total += best;
    }

    return { page, score: total };
  }).filter((entry) => entry.score > 0);

  return scored
    .sort((a, b) => b.score - a.score || a.page.label.localeCompare(b.page.label))
    .map((entry) => entry.page);
}
