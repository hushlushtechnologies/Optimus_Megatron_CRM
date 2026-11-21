import {
  AlertTriangle,
  ArrowRightLeft,
  BadgeCheck,
  Ban,
  BanknoteArrowDown,
  BellRing,
  BookmarkCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  Coins,
  Gift,
  HandCoins,
  LogIn,
  MailQuestion,
  Megaphone,
  PackageCheck,
  PauseCircle,
  Repeat,
  SlidersHorizontal,
  Trophy,
  UserCheck,
  XCircle,
  Bell,
  type LucideIcon,
} from "lucide-react";

import type { AppNotification } from "@/src/lib/types/notification";

/*
|--------------------------------------------------------------------------
| NOTIFICATION PRESENTATION
|--------------------------------------------------------------------------
|
| One place that decides how a notification looks and where it goes, shared
| by the topbar dropdown and the Notifications page so the two can never
| drift apart.
|
| Add a new notification type here and both surfaces pick it up.
*/

const TYPE_ICON: Record<string, LucideIcon> = {
  // Leads
  lead_assigned: UserCheck,
  lead_reassigned: ArrowRightLeft,
  lead_stage_changed: Repeat,
  lead_won: Trophy,
  lead_lost: XCircle,
  follow_up_due: Clock,
  follow_up_overdue: AlertTriangle,

  // Enquiries
  enquiry_received: MailQuestion,
  enquiry_assigned: UserCheck,
  enquiry_reassigned: ArrowRightLeft,
  enquiry_status_changed: Repeat,
  enquiry_urgent: AlertTriangle,

  // Test drives
  test_drive_assigned: UserCheck,
  test_drive_reassigned: ArrowRightLeft,
  test_drive_rescheduled: CalendarClock,
  test_drive_new_request: ClipboardList,
  test_drive_approved: CheckCircle2,
  test_drive_rejected: XCircle,
  test_drive_cancelled: Ban,
  test_drive_completed: BadgeCheck,
  test_drive_reminder: BellRing,
  test_drive_overdue: AlertTriangle,
  test_drive_checked_in: LogIn,

  // Sales, reservations and payments
  deal_assigned: UserCheck,
  deal_reassigned: ArrowRightLeft,
  deal_status_changed: Repeat,
  deal_confirmed: CheckCircle2,
  deal_cancelled: Ban,
  deal_completed: BadgeCheck,
  discount_approval_requested: AlertTriangle,
  discount_approved: CheckCircle2,
  payment_recorded: BanknoteArrowDown,
  payment_awaiting_verification: Clock,
  payment_verified: CheckCircle2,
  payment_reversed: Ban,
  reservation_requested: ClipboardList,
  reservation_confirmed: BookmarkCheck,
  reservation_expiring: Clock,
  reservation_expired: AlertTriangle,
  reservation_cancelled: Ban,
  delivery_ready: PackageCheck,
  delivery_completed: BadgeCheck,

  // Offers and loyalty
  offer_assigned: Gift,
  offer_expiring: CalendarClock,
  promotion_started: Megaphone,
  promotion_paused: PauseCircle,
  points_earned: Coins,
  points_redeemed: HandCoins,
  points_expiring: Clock,
  points_adjusted: SlidersHorizontal,
};

/** The icon for a notification type, falling back to a plain bell. */
export function notificationIcon(type: string): LucideIcon {
  return TYPE_ICON[type] ?? Bell;
}

/*
 * Only routes that exist are ever returned. A notification pointing at a
 * module that hasn't been built yet simply isn't a link, which is better
 * than sending someone to a 404 from their own notification list.
 */
const ENTITY_ROUTES: Record<string, string> = {
  enquiry: "/admin/enquiries",
  lead: "/admin/leads",
  test_drive: "/admin/test-drives",
  customer: "/admin/customers",
  deal: "/admin/sales",
  sales_deal: "/admin/sales",
  reservation: "/admin/reservations",
  car: "/admin/inventory",
  vehicle: "/admin/inventory",
  promotion: "/admin/offers",
};

const LIST_ROUTES: Record<string, string> = {
  enquiries: "/admin/enquiries",
  leads: "/admin/leads",
  test_drives: "/admin/test-drives",
  customers: "/admin/customers",
  deals: "/admin/sales",
  sales: "/admin/sales",
  reservations: "/admin/reservations",
  cars: "/admin/inventory",
  payments: "/admin/sales/payments",
  offers: "/admin/offers",
  promotions: "/admin/offers",
};

/** Where a notification should take the person, or null when nothing can be opened. */
export function notificationHref(
  notification: Pick<AppNotification, "entity_type" | "entity_id">,
): string | null {
  const entityType = notification.entity_type;
  if (!entityType) return null;

  const base = ENTITY_ROUTES[entityType];
  if (base && notification.entity_id) return `${base}/${notification.entity_id}`;

  return LIST_ROUTES[entityType] ?? null;
}

/** Plain-language group heading for a notification's date. */
export function notificationDayLabel(isoDate: string, now: Date = new Date()): string {
  const created = new Date(isoDate);

  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  const dayDifference = Math.round((startOfDay(now) - startOfDay(created)) / 86_400_000);

  if (dayDifference <= 0) return "Today";
  if (dayDifference === 1) return "Yesterday";
  if (dayDifference < 7) return "Earlier this week";
  if (dayDifference < 30) return "Earlier this month";

  return "Older";
}
