import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Car,
  UserCircle,
  Target,
  CalendarClock,
  BookmarkCheck,
  MailQuestion,
  BarChart3,
  LineChart,
  Tag,
  CreditCard,
  MessageSquare,
  ScrollText,
  Newspaper,
  BookOpen,
  Star,
  Wrench,
  Image as ImageIcon,
  Bell,
  SlidersHorizontal,
  Handshake,
} from "lucide-react";

/*
|--------------------------------------------------------------------------
| NAVIGATION STATUS
|--------------------------------------------------------------------------
|
| "live" — the module is built and the link works.
|
| "soon" — the module is planned but has no route yet. The sidebar renders
|          these locked, with the reason available to screen readers and as
|          a tooltip, instead of sending people to a 404. This mirrors the
|          pattern already used by FutureModuleActions on Lead Detail.
|
| Never set a module to "live" before its page exists.
*/

export type NavStatus = "live" | "soon";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  status: NavStatus;
  /** Why a locked item isn't available yet. Shown as a tooltip and to screen readers. */
  note?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Main",
    items: [
      {
        label: "Dashboard",
        href: "/admin",
        icon: LayoutDashboard,
        status: "live",
      },
      {
        label: "Inventory",
        href: "/admin/inventory",
        icon: Car,
        status: "live",
      },
      {
        label: "Customers",
        href: "/admin/customers",
        icon: UserCircle,
        status: "live",
      },
      {
        label: "Leads",
        href: "/admin/leads",
        icon: Target,
        status: "live",
      },
      {
        label: "Test Drives",
        href: "/admin/test-drives",
        icon: CalendarClock,
        status: "live",
      },
      {
        label: "Sales",
        href: "/admin/sales",
        icon: Handshake,
        status: "live",
      },
      {
        label: "Reservations",
        href: "/admin/reservations",
        icon: BookmarkCheck,
        status: "live",
      },
      {
        label: "Staff & Users",
        href: "/admin/users",
        icon: Users,
        status: "soon",
        note: "Arrives with Staff Management",
      },
      {
        label: "Enquiry Requests",
        href: "/admin/enquiries",
        icon: MailQuestion,
        status: "soon",
        note: "Arrives with Website Integration",
      },
    ],
  },
  {
    title: "CRM",
    items: [
      {
        label: "Payments",
        href: "/admin/sales/payments",
        icon: CreditCard,
        status: "live",
      },
            {
        label: "Reports",
        href: "/admin/reports",
        icon: BarChart3,
        status: "live",
      },
      {
        label: "Analytics",
        href: "/admin/analytics",
        icon: LineChart,
        status: "soon",
        note: "Arrives with Live Dashboard & Analytics",
      },
      {
        label: "Offers & Promotions",
        href: "/admin/offers",
        icon: Tag,
        status: "soon",
        note: "Arrives with Offers & Loyalty Points",
      },
      {
        label: "Communications",
        href: "/admin/communications",
        icon: MessageSquare,
        status: "soon",
        note: "Arrives once email and WhatsApp are connected",
      },
      {
        label: "Audit Logs",
        href: "/admin/audit-logs",
        icon: ScrollText,
        status: "soon",
        note: "Arrives with Production Hardening",
      },
    ],
  },
  {
    title: "Content",
    items: [
      {
        label: "Car News",
        href: "/admin/news",
        icon: Newspaper,
        status: "soon",
        note: "Arrives with Website Integration",
      },
      {
        label: "Buyer Guides",
        href: "/admin/guides",
        icon: BookOpen,
        status: "soon",
        note: "Arrives with Website Integration",
      },
      {
        label: "Expert Reviews",
        href: "/admin/reviews",
        icon: Star,
        status: "soon",
        note: "Arrives with Website Integration",
      },
      {
        label: "Maintenance Tutorials",
        href: "/admin/tutorials",
        icon: Wrench,
        status: "soon",
        note: "Arrives with Website Integration",
      },
      {
        label: "Media Library",
        href: "/admin/media",
        icon: ImageIcon,
        status: "soon",
        note: "Arrives with Website Integration",
      },
    ],
  },
  {
    title: "System",
    items: [
      {
        label: "Notifications",
        href: "/admin/notifications",
        icon: Bell,
        status: "live",
      },
      {
        label: "Sales Settings",
        href: "/admin/sales/settings",
        icon: SlidersHorizontal,
        status: "live",
      },
    ],
  },
];

/**
 * Every destination that actually exists, longest path first.
 *
 * The sidebar highlights the LONGEST match for the current path, so
 * /admin/sales/payments highlights Payments rather than also lighting up
 * Sales. Sorting once here keeps that cheap on every render.
 */
export const LIVE_NAV_HREFS: string[] = NAV_SECTIONS.flatMap((section) => section.items)
  .filter((item) => item.status === "live")
  .map((item) => item.href)
  .sort((a, b) => b.length - a.length);

/** Which live nav destination owns this path, or null when none does. */
export function activeNavHref(pathname: string): string | null {
  return (
    LIVE_NAV_HREFS.find(
      (href) => pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`)),
    ) ?? null
  );
}